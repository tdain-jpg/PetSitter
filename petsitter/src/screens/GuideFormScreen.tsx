import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
  Switch,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Input, Card, ContactCard, ScreenHeader, ScreenContainer, SaveStatusIndicator, TravelItineraryEditor, Select } from '../components';
import { useAutoSave } from '../hooks';
import { useData, useAuth } from '../contexts';
import { generateId } from '../services';
import { COLORS } from '../constants';
import { showAlert, showConfirm } from '../lib/dialogs';
import { isValidDateString } from '../lib/dates';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { EmergencyContact, HomeInfo, TravelItinerary, ContactType } from '../types';

type Props = NativeStackScreenProps<MainStackParamList, 'GuideForm'>;

interface FormData {
  title: string;
  pet_ids: string[];
  start_date: string;
  end_date: string;
  emergency_contacts: EmergencyContact[];
  home_info: HomeInfo;
  travel_itinerary?: TravelItinerary;
  additional_notes: string;
}

const initialFormData: FormData = {
  title: '',
  pet_ids: [],
  start_date: '',
  end_date: '',
  emergency_contacts: [],
  home_info: {},
  travel_itinerary: undefined,
  additional_notes: '',
};

const contactTypeOptions = [
  { label: 'Personal (Friend/Family)', value: 'personal' },
  { label: 'Neighbor', value: 'neighbor' },
  { label: 'Veterinarian - Primary', value: 'vet_primary' },
  { label: 'Veterinarian - Emergency 24hr', value: 'vet_emergency' },
  { label: 'Veterinarian - Specialist', value: 'vet_specialty' },
  { label: 'Other', value: 'other' },
];

export function GuideFormScreen({ navigation, route }: Props) {
  const { mode, guideId } = route.params as { mode: string; guideId?: string };
  const isEditing = mode === 'edit' && guideId;

  const { user } = useAuth();
  const { guides, pets, activePets, loadingPets, loadingGuides, petsError, createGuide, updateGuide } =
    useData();

  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(!!isEditing);
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState<Partial<EmergencyContact>>({});
  const [contactErrors, setContactErrors] = useState<{ name?: string; phone?: string }>({});
  const [dataLoaded, setDataLoaded] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  // Mirror of isDirty that the unload/navigation guards can read synchronously.
  // A setState from the success path lands too late for a listener that fires
  // in the same tick, so the guards always consult the ref.
  const isDirtyRef = useRef(false);
  // True while the discard confirm is open. Unlike the old blocking
  // window.confirm, showConfirm is async — a second browser-back while the
  // dialog is up would re-enter beforeRemove, queue a duplicate dialog, and
  // double-dispatch the blocked action (popping one screen too far).
  const promptingRef = useRef(false);

  // MERGED-VIEW MODEL: activePets spans every household the user belongs to,
  // but a guide's pets must all live in ONE household — otherwise fellow
  // members of the guide's household hit the RLS silent-empty trap (pets they
  // can't see render as missing in detail, daily-routine, and PDF views).
  // Editing locks the picker to the guide's own household; creating locks it
  // to the first selected pet's household (null = nothing locked yet, or
  // legacy rows without household_id — behaves as before).
  const lockedHouseholdId = useMemo(() => {
    if (isEditing) {
      return guides.find((g) => g.id === guideId)?.household_id ?? null;
    }
    const firstSelected = activePets.find((p) => formData.pet_ids.includes(p.id));
    return firstSelected?.household_id ?? null;
  }, [isEditing, guideId, guides, activePets, formData.pet_ids]);

  const isPetLockedOut = (pet: { household_id?: string }) =>
    !!lockedHouseholdId && !!pet.household_id && pet.household_id !== lockedHouseholdId;

  // Build guide data from form data object (accepts data as parameter to avoid stale closures)
  const buildGuideDataFromForm = useCallback((data: FormData) => {
    if (!user) return null;

    return {
      user_id: user.id,
      title: data.title.trim(),
      pet_ids: data.pet_ids,
      start_date: data.start_date || undefined,
      end_date: data.end_date || undefined,
      emergency_contacts: data.emergency_contacts,
      home_info: data.home_info,
      travel_itinerary: data.travel_itinerary,
      additional_notes: data.additional_notes.trim() || undefined,
    };
  }, [user]);

  // Convenience wrapper that uses current formData state (for manual submit)
  const buildGuideData = useCallback(() => {
    return buildGuideDataFromForm(formData);
  }, [formData, buildGuideDataFromForm]);

  // Auto-save callback for edit mode - accepts data from useAutoSave to avoid stale closures
  const handleAutoSave = useCallback(async (data: FormData) => {
    if (!guideId || !data.title.trim()) return;
    const guideData = buildGuideDataFromForm(data);
    if (guideData) {
      await updateGuide(guideId, guideData);
    }
  }, [guideId, buildGuideDataFromForm, updateGuide]);

  // Create a stable reference for auto-save data
  const autoSaveData = useMemo(() => ({ ...formData }), [formData]);

  // Auto-save hook - only enabled when editing and data is loaded
  const { status: saveStatus, lastSaved, error: saveError, saveNow } = useAutoSave({
    data: autoSaveData,
    onSave: handleAutoSave,
    debounceMs: 1000,
    enabled: !!isEditing && dataLoaded && !!formData.title.trim(),
  });

  // Load existing guide data for editing — hydrate only once per guideId.
  // `guides` stays in the deps so a late-arriving fetch can still hydrate,
  // but the ref guard stops auto-save updates (which replace the guides
  // array) from resetting the form and clobbering in-flight keystrokes.
  const hydratedGuideIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (isEditing && guideId) {
      if (hydratedGuideIdRef.current === guideId) return;
      // Defer hydration until the pets load settles: pet_ids is pruned against
      // the merged pets list below, and pruning against an empty in-flight
      // array would wipe the guide's pet list (auto-save would persist it).
      if (loadingPets) return;
      // Same for guides: a deep-link restore can mount this screen before the
      // guides fetch resolves; without this, an empty edit form renders and is
      // clobbered when hydration finally runs.
      if (loadingGuides) return;
      const guide = guides.find((g) => g.id === guideId);
      if (guide) {
        hydratedGuideIdRef.current = guideId;
        // Prune ids with no matching pets row. RLS guarantees `pets` (the full
        // merged list, deceased included — NOT activePets) holds every live pet
        // of the guide's household, so a leftover id belongs to a DELETED pet:
        // deletePet does no guides.pet_ids cleanup, and 0007's
        // guides_validate_pet_ids trigger rejects every save that still lists
        // the ghost id — with no UI recovery, since deleted pets never render
        // in the picker. The next auto-save persists the pruned list, healing
        // the guide. If the pets load FAILED, keep pet_ids verbatim: pruning
        // against a bad list could wipe a healthy guide's pets.
        const petIds = petsError
          ? guide.pet_ids
          : guide.pet_ids.filter((id) => pets.some((p) => p.id === id));
        setFormData({
          title: guide.title,
          pet_ids: petIds,
          start_date: guide.start_date || '',
          end_date: guide.end_date || '',
          emergency_contacts: guide.emergency_contacts,
          home_info: guide.home_info,
          travel_itinerary: guide.travel_itinerary,
          additional_notes: guide.additional_notes || '',
        });
        // Mark data as loaded to enable auto-save
        setTimeout(() => setDataLoaded(true), 100);
      }
      setLoading(false);
    }
  }, [isEditing, guideId, guides, pets, loadingPets, loadingGuides, petsError]);

  // Create mode throws the form away on leave, so every exit needs a confirm.
  // Edit mode auto-saves, so leaving is always safe and must stay unguarded.
  const guardUnsavedChanges = !isEditing;

  const markDirty = useCallback(() => {
    isDirtyRef.current = true;
    setIsDirty(true);
  }, []);

  const clearDirty = useCallback(() => {
    isDirtyRef.current = false;
    setIsDirty(false);
  }, []);

  // Web: warn before a refresh or tab close discards the form.
  useEffect(() => {
    if (Platform.OS !== 'web' || !guardUnsavedChanges || !isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Re-check the ref so a successful submit silences the prompt at once,
      // before React has re-rendered and torn this listener down.
      if (!isDirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [guardUnsavedChanges, isDirty]);

  // Browser back, Android hardware back, the header Cancel button and any
  // programmatic goBack() all funnel through beforeRemove, so the discard
  // confirm lives here only — no caller adds its own, so it can never
  // double-prompt. The success path clears the dirty ref first, so saving
  // and leaving stays silent.
  useEffect(() => {
    if (!guardUnsavedChanges) return;
    return navigation.addListener('beforeRemove', (e) => {
      if (!isDirtyRef.current) return;
      // The listener must stay synchronous: block the navigation first, then
      // let the async confirm re-dispatch the blocked action on approval.
      e.preventDefault();
      if (promptingRef.current) return; // a discard prompt is already open
      promptingRef.current = true;
      showConfirm({
        title: 'Discard Guide',
        message: 'Your unsaved changes will be lost.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep Editing',
        destructive: true,
      }).then((ok) => {
        promptingRef.current = false;
        if (ok) {
          clearDirty();
          navigation.dispatch(e.data.action);
        }
      });
    });
  }, [navigation, guardUnsavedChanges, clearDirty]);

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    markDirty();
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const updateHomeInfo = (field: keyof HomeInfo, value: string) => {
    setFormData((prev) => ({
      ...prev,
      home_info: { ...prev.home_info, [field]: value || undefined },
    }));
    markDirty();
  };

  const togglePet = (petId: string) => {
    setFormData((prev) => ({
      ...prev,
      pet_ids: prev.pet_ids.includes(petId)
        ? prev.pet_ids.filter((id) => id !== petId)
        : [...prev.pet_ids, petId],
    }));
    markDirty();
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    // Dates are optional here, but anything typed must be a real YYYY-MM-DD:
    // free text persists verbatim and later renders as an empty date on the
    // guide, in the PDF export and in the shared sitter view.
    const start = formData.start_date.trim();
    const end = formData.end_date.trim();
    if (start && !isValidDateString(start)) {
      newErrors.start_date = 'Enter a real date in YYYY-MM-DD format';
    }
    if (end && !isValidDateString(end)) {
      newErrors.end_date = 'Enter a real date in YYYY-MM-DD format';
    } else if (start && end && !newErrors.start_date && end < start) {
      // Both are validated 'YYYY-MM-DD', so string order is date order.
      newErrors.end_date = 'End date must be on or after the start date';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!user) return;

    // A half-filled contact sub-form has its own inner Save; submitting the
    // guide while it holds text used to silently discard the draft (QA D4).
    if (
      showContactForm &&
      ((contactForm.name?.trim() ?? '') !== '' || (contactForm.phone?.trim() ?? '') !== '')
    ) {
      const proceed = await showConfirm({
        title: 'Unsaved contact',
        message:
          "You started adding an emergency contact but haven't saved it. Save the guide without this contact?",
        confirmLabel: 'Save without contact',
        cancelLabel: 'Go back',
        destructive: true,
      });
      if (!proceed) return;
    }

    setIsSubmitting(true);

    try {
      const guideData = buildGuideData();
      if (!guideData) return;

      if (isEditing && guideId) {
        // buildGuideDataFromForm never includes household_id, so auto-save and
        // manual edits can't accidentally move a guide between households.
        await updateGuide(guideId, guideData);
      } else {
        // Create the guide in the same household as its selected pets; without
        // a lock (no pets selected, or legacy pets missing household_id) the
        // server default assigns the user's primary household.
        await createGuide(
          lockedHouseholdId ? { ...guideData, household_id: lockedHouseholdId } : guideData
        );
      }

      // Saved — drop the guard (ref first, so the listeners see it in this
      // same tick) before navigating, or leaving would prompt to discard.
      clearDirty();
      navigation.goBack();
    } catch (error: any) {
      const message = error.message || 'Failed to save guide';
      showAlert('Error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Contact Form Handlers
  const handleAddContact = () => {
    setContactForm({
      name: '',
      phone: '',
      relationship: '',
      contact_type: 'personal',
      is_primary: formData.emergency_contacts.length === 0,
    });
    setContactErrors({});
    setEditingContactId(null);
    setShowContactForm(true);
  };

  const handleEditContact = (contact: EmergencyContact) => {
    setContactForm({ ...contact });
    setContactErrors({});
    setEditingContactId(contact.id);
    setShowContactForm(true);
  };

  const handleSaveContact = () => {
    const name = contactForm.name;
    const phone = contactForm.phone;
    if (!name || !phone) {
      setContactErrors({
        name: name ? undefined : 'Name is required',
        phone: phone ? undefined : 'Phone is required',
      });
      return;
    }
    setContactErrors({});

    if (editingContactId) {
      // Update existing
      setFormData((prev) => ({
        ...prev,
        emergency_contacts: prev.emergency_contacts.map((c) =>
          c.id === editingContactId ? { ...c, ...contactForm } as EmergencyContact : c
        ),
      }));
    } else {
      // Add new
      const newContact: EmergencyContact = {
        id: generateId(),
        name,
        phone,
        email: contactForm.email,
        relationship: contactForm.relationship || 'Contact',
        contact_type: contactForm.contact_type || 'personal',
        is_primary: contactForm.is_primary || false,
        has_key: contactForm.has_key || false,
        notes: contactForm.notes,
      };
      setFormData((prev) => ({
        ...prev,
        emergency_contacts: [...prev.emergency_contacts, newContact],
      }));
    }

    markDirty();
    setShowContactForm(false);
    setContactForm({});
    setEditingContactId(null);
  };

  const handleDeleteContact = (contactId: string) => {
    setFormData((prev) => ({
      ...prev,
      emergency_contacts: prev.emergency_contacts.filter((c) => c.id !== contactId),
    }));
    markDirty();
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-200">
        <ActivityIndicator size="large" color={COLORS.secondary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
    >
      <View className="flex-1 bg-cream-200">
        <StatusBar style="dark" />

        {/* Header */}
        <ScreenHeader
          title={isEditing ? 'Edit Guide' : 'New Guide'}
          backLabel={isEditing ? '← Done' : 'Cancel'}
          onBack={() => navigation.goBack()}
        />

        {/* Auto-save status indicator for edit mode */}
        {isEditing && (
          <View className="px-4 py-2 bg-cream-50 border-b border-tan-200">
            <ScreenContainer variant="form">
              <SaveStatusIndicator
                status={saveStatus}
                lastSaved={lastSaved}
                error={saveError}
              />
            </ScreenContainer>
          </View>
        )}

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          <ScreenContainer variant="form">
            {/* Basic Info */}
            <Card className="mb-4">
              <Text className="text-lg font-semibold text-brown-800 mb-4">
                Basic Information
              </Text>

              <Input
                label="Guide Title *"
                placeholder="e.g., Weekend Trip - January 2025"
                value={formData.title}
                onChangeText={(v) => updateField('title', v)}
                error={errors.title}
              />

              <Input
                label="Start Date"
                placeholder="YYYY-MM-DD"
                value={formData.start_date}
                onChangeText={(v) => updateField('start_date', v)}
                error={errors.start_date}
              />
              <Input
                label="End Date"
                placeholder="YYYY-MM-DD"
                value={formData.end_date}
                onChangeText={(v) => updateField('end_date', v)}
                error={errors.end_date}
              />
            </Card>

            {/* Pet Selection */}
            <Card className="mb-4">
              <Text className="text-lg font-semibold text-brown-800 mb-4">
                Select Pets
              </Text>

              {activePets.length === 0 ? (
                <View className="items-center py-4">
                  <Text className="text-tan-500 mb-2">No pets available.</Text>
                  <Button
                    title="Add a Pet First"
                    onPress={() => (navigation as any).navigate('PetForm', { mode: 'create' })}
                    variant="outline"
                  />
                </View>
              ) : (
                <View className="gap-2">
                  {activePets.map((pet) => {
                    const selected = formData.pet_ids.includes(pet.id);
                    // Already-selected pets stay toggleable so a legacy guide
                    // that mixed households can still be cleaned up by hand.
                    const lockedOut = !selected && isPetLockedOut(pet);
                    return (
                      <Pressable
                        key={pet.id}
                        onPress={() => togglePet(pet.id)}
                        disabled={lockedOut}
                        accessibilityRole="checkbox"
                        accessibilityLabel={pet.name}
                        accessibilityState={{ checked: selected, disabled: lockedOut }}
                        aria-checked={selected}
                        className={`flex-row items-center p-3 rounded-lg border ${
                          selected
                            ? 'bg-primary-50 border-primary-200'
                            : 'bg-cream-200 border-tan-200'
                        } ${lockedOut ? 'opacity-40' : ''}`}
                      >
                        <View
                          className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
                            selected
                              ? 'bg-primary-500 border-primary-500'
                              : 'border-tan-300'
                          }`}
                        >
                          {selected && (
                            <Text className="text-white text-xs">✓</Text>
                          )}
                        </View>
                        <Text className="text-brown-800 font-medium">{pet.name}</Text>
                        <Text className="text-tan-500 ml-2 capitalize">
                          ({pet.species})
                        </Text>
                      </Pressable>
                    );
                  })}
                  {activePets.some((pet) => isPetLockedOut(pet)) && (
                    <Text className="text-tan-500 text-sm mt-1">
                      A guide can only include pets from one household, so pets from
                      your other households are unavailable here.
                    </Text>
                  )}
                </View>
              )}
            </Card>

            {/* Emergency Contacts */}
            <Card className="mb-4">
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-lg font-semibold text-brown-800">
                  Emergency Contacts
                </Text>
                <Pressable
                  onPress={handleAddContact}
                  className="bg-secondary-50 px-3 py-1 rounded"
                  accessibilityRole="button"
                  accessibilityLabel="Add emergency contact"
                >
                  <Text className="text-secondary-600 text-sm">+ Add Contact</Text>
                </Pressable>
              </View>

              {formData.emergency_contacts.length === 0 ? (
                <Text className="text-tan-500">No emergency contacts added.</Text>
              ) : (
                formData.emergency_contacts.map((contact) => (
                  <ContactCard
                    key={contact.id}
                    contact={contact}
                    onEdit={() => handleEditContact(contact)}
                    onDelete={() => handleDeleteContact(contact.id)}
                  />
                ))
              )}

              {/* Contact Form */}
              {showContactForm && (
                <View className="mt-4 p-4 bg-tan-100 rounded-lg">
                  <Text className="font-semibold text-brown-800 mb-3">
                    {editingContactId ? 'Edit Contact' : 'Add Contact'}
                  </Text>
                  <Input
                    label="Name *"
                    placeholder="Contact name"
                    value={contactForm.name || ''}
                    onChangeText={(v) => {
                      setContactForm((prev) => ({ ...prev, name: v }));
                      if (contactErrors.name) {
                        setContactErrors((prev) => ({ ...prev, name: undefined }));
                      }
                    }}
                    error={contactErrors.name}
                  />
                  <Input
                    label="Phone *"
                    placeholder="(555) 123-4567"
                    value={contactForm.phone || ''}
                    onChangeText={(v) => {
                      setContactForm((prev) => ({ ...prev, phone: v }));
                      if (contactErrors.phone) {
                        setContactErrors((prev) => ({ ...prev, phone: undefined }));
                      }
                    }}
                    formatAsPhone
                    error={contactErrors.phone}
                  />
                  <Input
                    label="Email"
                    placeholder="email@example.com"
                    value={contactForm.email || ''}
                    onChangeText={(v) => setContactForm((prev) => ({ ...prev, email: v }))}
                    keyboardType="email-address"
                  />
                  <Select
                    label="Contact Type"
                    value={contactForm.contact_type || 'personal'}
                    options={contactTypeOptions}
                    onValueChange={(v) => setContactForm((prev) => ({ ...prev, contact_type: v as ContactType }))}
                  />
                  <Input
                    label="Relationship"
                    placeholder="e.g., Neighbor, Friend, Vet"
                    value={contactForm.relationship || ''}
                    onChangeText={(v) => setContactForm((prev) => ({ ...prev, relationship: v }))}
                  />
                  <View className="flex-row items-center mb-4">
                    <Switch
                      value={contactForm.is_primary || false}
                      onValueChange={(v) => setContactForm((prev) => ({ ...prev, is_primary: v }))}
                    />
                    <Text className="ml-2 text-brown-600">Primary Contact</Text>
                  </View>
                  {contactForm.contact_type === 'neighbor' && (
                    <View className="flex-row items-center mb-4">
                      <Switch
                        value={contactForm.has_key || false}
                        onValueChange={(v) => setContactForm((prev) => ({ ...prev, has_key: v }))}
                      />
                      <Text className="ml-2 text-brown-600">Has a key to the house</Text>
                    </View>
                  )}
                  <View className="flex-row gap-2">
                    <Button title="Save" onPress={handleSaveContact} variant="primary" />
                    <Button
                      title="Cancel"
                      onPress={() => {
                        setShowContactForm(false);
                        setContactForm({});
                        setContactErrors({});
                        setEditingContactId(null);
                      }}
                      variant="outline"
                    />
                  </View>
                </View>
              )}
            </Card>

            {/* Home Info */}
            <Card className="mb-4">
              <Text className="text-lg font-semibold text-brown-800 mb-4">
                Home Information
              </Text>

              <Input
                label="Address"
                placeholder="123 Main Street, City, State"
                value={formData.home_info.address || ''}
                onChangeText={(v) => updateHomeInfo('address', v)}
              />

              <Input
                label="WiFi Network"
                placeholder="Network name"
                value={formData.home_info.wifi_name || ''}
                onChangeText={(v) => updateHomeInfo('wifi_name', v)}
              />
              <Input
                label="WiFi Password"
                placeholder="Password"
                value={formData.home_info.wifi_password || ''}
                onChangeText={(v) => updateHomeInfo('wifi_password', v)}
              />

              <Input
                label="Door Code"
                placeholder="Entry code"
                value={formData.home_info.door_code || ''}
                onChangeText={(v) => updateHomeInfo('door_code', v)}
              />

              <Input
                label="Alarm Code"
                placeholder="Alarm disarm code"
                value={formData.home_info.alarm_code || ''}
                onChangeText={(v) => updateHomeInfo('alarm_code', v)}
              />

              <Input
                label="Garage Code"
                placeholder="Garage code"
                value={formData.home_info.garage_code || ''}
                onChangeText={(v) => updateHomeInfo('garage_code', v)}
              />
              <Input
                label="Gate Code"
                placeholder="Gate code"
                value={formData.home_info.gate_code || ''}
                onChangeText={(v) => updateHomeInfo('gate_code', v)}
              />
              <Input
                label="Mailbox Code"
                placeholder="Mailbox code"
                value={formData.home_info.mailbox_code || ''}
                onChangeText={(v) => updateHomeInfo('mailbox_code', v)}
              />

              <Input
                label="Spare Key Location"
                placeholder="e.g., Under the mat, With neighbor"
                value={formData.home_info.spare_key_location || ''}
                onChangeText={(v) => updateHomeInfo('spare_key_location', v)}
              />

              <Input
                label="Trash Day"
                placeholder="e.g., Tuesday"
                value={formData.home_info.trash_day || ''}
                onChangeText={(v) => updateHomeInfo('trash_day', v)}
              />

              <Input
                label="Additional Notes"
                placeholder="Any other home information"
                value={formData.home_info.notes || ''}
                onChangeText={(v) => updateHomeInfo('notes', v)}
                multiline
                numberOfLines={3}
              />
            </Card>

            {/* Travel Itinerary */}
            <Card className="mb-4">
              <Text className="text-lg font-semibold text-brown-800 mb-4">
                Travel Itinerary
              </Text>
              <TravelItineraryEditor
                value={formData.travel_itinerary}
                onChange={(v) => updateField('travel_itinerary', v)}
              />
            </Card>

            {/* Additional Notes */}
            <Card className="mb-4">
              <Input
                label="Additional Notes"
                placeholder="Any other instructions for the pet sitter"
                value={formData.additional_notes}
                onChangeText={(v) => updateField('additional_notes', v)}
                multiline
                numberOfLines={4}
              />
            </Card>

            {/* Submit Button - only show for new guides, edit mode uses auto-save */}
            {!isEditing && (
              <View className="mb-8">
                <Button
                  title="Create Guide"
                  onPress={handleSubmit}
                  loading={isSubmitting}
                  disabled={isSubmitting}
                />
              </View>
            )}

            {/* Edit mode: repeat the save status at the bottom of the long form
                and offer an explicit Done that flushes any pending auto-save. */}
            {isEditing && (
              <View className="mb-8">
                <View className="mb-3">
                  <SaveStatusIndicator
                    status={saveStatus}
                    lastSaved={lastSaved}
                    error={saveError}
                  />
                </View>
                <Button
                  title="Done"
                  variant="primary"
                  onPress={() => {
                    saveNow();
                    navigation.goBack();
                  }}
                />
              </View>
            )}
          </ScreenContainer>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
