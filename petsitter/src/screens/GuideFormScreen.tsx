import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Pressable,
  Switch,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Input, Card, ScreenHeader, SaveStatusIndicator, TravelItineraryEditor, Select } from '../components';
import { useAutoSave } from '../hooks';
import { useData, useAuth } from '../contexts';
import { generateId } from '../services';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '../navigation/types';
import type { Guide, EmergencyContact, HomeInfo, Pet, TravelItinerary, ContactType } from '../types';

type Props = NativeStackScreenProps<MainTabParamList, 'GuideForm'>;

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
  const { guides, activePets, createGuide, updateGuide } = useData();

  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(!!isEditing);
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState<Partial<EmergencyContact>>({});
  const [dataLoaded, setDataLoaded] = useState(false);

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
  const { status: saveStatus, lastSaved, error: saveError } = useAutoSave({
    data: autoSaveData,
    onSave: handleAutoSave,
    debounceMs: 1000,
    enabled: !!isEditing && dataLoaded && !!formData.title.trim(),
  });

  // Load existing guide data for editing
  useEffect(() => {
    if (isEditing && guideId) {
      const guide = guides.find((g) => g.id === guideId);
      if (guide) {
        setFormData({
          title: guide.title,
          pet_ids: guide.pet_ids,
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
  }, [isEditing, guideId, guides]);

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const updateHomeInfo = (field: keyof HomeInfo, value: string) => {
    setFormData((prev) => ({
      ...prev,
      home_info: { ...prev.home_info, [field]: value || undefined },
    }));
  };

  const togglePet = (petId: string) => {
    setFormData((prev) => ({
      ...prev,
      pet_ids: prev.pet_ids.includes(petId)
        ? prev.pet_ids.filter((id) => id !== petId)
        : [...prev.pet_ids, petId],
    }));
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!user) return;

    setIsSubmitting(true);

    try {
      const guideData = buildGuideData();
      if (!guideData) return;

      if (isEditing && guideId) {
        await updateGuide(guideId, guideData);
      } else {
        await createGuide(guideData);
      }

      navigation.goBack();
    } catch (error: any) {
      const message = error.message || 'Failed to save guide';
      if (Platform.OS === 'web') {
        alert(message);
      } else {
        Alert.alert('Error', message);
      }
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
      is_primary: formData.emergency_contacts.length === 0,
    });
    setEditingContactId(null);
    setShowContactForm(true);
  };

  const handleEditContact = (contact: EmergencyContact) => {
    setContactForm({ ...contact });
    setEditingContactId(contact.id);
    setShowContactForm(true);
  };

  const handleSaveContact = () => {
    if (!contactForm.name || !contactForm.phone) {
      return;
    }

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
        name: contactForm.name,
        phone: contactForm.phone,
        email: contactForm.email,
        relationship: contactForm.relationship || 'Contact',
        is_primary: contactForm.is_primary || false,
        notes: contactForm.notes,
      };
      setFormData((prev) => ({
        ...prev,
        emergency_contacts: [...prev.emergency_contacts, newContact],
      }));
    }

    setShowContactForm(false);
    setContactForm({});
    setEditingContactId(null);
  };

  const handleDeleteContact = (contactId: string) => {
    setFormData((prev) => ({
      ...prev,
      emergency_contacts: prev.emergency_contacts.filter((c) => c.id !== contactId),
    }));
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
            <SaveStatusIndicator
              status={saveStatus}
              lastSaved={lastSaved}
              error={saveError}
            />
          </View>
        )}

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16 }}
          keyboardShouldPersistTaps="handled"
        >
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

            {Platform.OS === 'web' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 14, color: COLORS.brown, marginBottom: 8, fontWeight: 500 }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => updateField('start_date', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      fontSize: 16,
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 14, color: COLORS.brown, marginBottom: 8, fontWeight: 500 }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => updateField('end_date', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      borderRadius: 8,
                      border: '1px solid #d1d5db',
                      fontSize: 16,
                    }}
                  />
                </div>
              </div>
            ) : (
              <>
                <Input
                  label="Start Date"
                  placeholder="YYYY-MM-DD"
                  value={formData.start_date}
                  onChangeText={(v) => updateField('start_date', v)}
                />
                <Input
                  label="End Date"
                  placeholder="YYYY-MM-DD"
                  value={formData.end_date}
                  onChangeText={(v) => updateField('end_date', v)}
                />
              </>
            )}
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
                {activePets.map((pet) => (
                  <Pressable
                    key={pet.id}
                    onPress={() => togglePet(pet.id)}
                    className={`flex-row items-center p-3 rounded-lg border ${
                      formData.pet_ids.includes(pet.id)
                        ? 'bg-primary-50 border-primary-200'
                        : 'bg-cream-200 border-tan-200'
                    }`}
                  >
                    <View
                      className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
                        formData.pet_ids.includes(pet.id)
                          ? 'bg-primary-500 border-primary-500'
                          : 'border-tan-300'
                      }`}
                    >
                      {formData.pet_ids.includes(pet.id) && (
                        <Text className="text-white text-xs">✓</Text>
                      )}
                    </View>
                    <Text className="text-brown-800 font-medium">{pet.name}</Text>
                    <Text className="text-tan-500 ml-2 capitalize">
                      ({pet.species})
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </Card>

          {/* Emergency Contacts */}
          <Card className="mb-4">
            <View className="flex-row justify-between items-center mb-4">
              <Text className="text-lg font-semibold text-brown-800">
                Emergency Contacts
              </Text>
              {Platform.OS === 'web' ? (
                <button
                  onClick={handleAddContact}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: COLORS.secondaryLight,
                    color: COLORS.secondary,
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  + Add Contact
                </button>
              ) : (
                <Pressable onPress={handleAddContact} className="bg-secondary-50 px-3 py-1 rounded">
                  <Text className="text-secondary-600 text-sm">+ Add Contact</Text>
                </Pressable>
              )}
            </View>

            {formData.emergency_contacts.length === 0 ? (
              <Text className="text-tan-500">No emergency contacts added.</Text>
            ) : (
              formData.emergency_contacts.map((contact) => (
                <View
                  key={contact.id}
                  className="bg-cream-200 rounded-lg p-3 mb-2 border border-tan-200"
                >
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2 flex-wrap">
                        <Text className="font-semibold text-brown-800">{contact.name}</Text>
                        {contact.is_primary && (
                          <View className="bg-primary-100 px-2 py-0.5 rounded-full">
                            <Text className="text-primary-600 text-xs">PRIMARY</Text>
                          </View>
                        )}
                        {contact.contact_type?.startsWith('vet') && (
                          <View className="bg-secondary-100 px-2 py-0.5 rounded-full">
                            <Text className="text-secondary-600 text-xs">
                              {contact.contact_type === 'vet_primary' ? 'VET' :
                               contact.contact_type === 'vet_emergency' ? 'VET 24HR' : 'SPECIALIST'}
                            </Text>
                          </View>
                        )}
                        {contact.has_key && (
                          <View className="bg-amber-100 px-2 py-0.5 rounded-full">
                            <Text className="text-amber-600 text-xs">HAS KEY</Text>
                          </View>
                        )}
                      </View>
                      <Text className="text-tan-500">{contact.relationship}</Text>
                      <Text className="text-primary-600">{contact.phone}</Text>
                    </View>
                    <View className="flex-row gap-2">
                      {Platform.OS === 'web' ? (
                        <>
                          <button
                            onClick={() => handleEditContact(contact)}
                            style={{
                              padding: '4px 8px',
                              backgroundColor: 'transparent',
                              color: COLORS.secondary,
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: 12,
                            }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteContact(contact.id)}
                            style={{
                              padding: '4px 8px',
                              backgroundColor: 'transparent',
                              color: COLORS.accent,
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: 12,
                            }}
                          >
                            Delete
                          </button>
                        </>
                      ) : (
                        <>
                          <Pressable onPress={() => handleEditContact(contact)} className="px-2 py-1">
                            <Text className="text-secondary-600 text-sm">Edit</Text>
                          </Pressable>
                          <Pressable onPress={() => handleDeleteContact(contact.id)} className="px-2 py-1">
                            <Text className="text-accent-600 text-sm">Delete</Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  </View>
                </View>
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
                  onChangeText={(v) => setContactForm((prev) => ({ ...prev, name: v }))}
                />
                <Input
                  label="Phone *"
                  placeholder="(555) 123-4567"
                  value={contactForm.phone || ''}
                  onChangeText={(v) => setContactForm((prev) => ({ ...prev, phone: v }))}
                  formatAsPhone
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

            {Platform.OS === 'web' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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
              </div>
            ) : (
              <>
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
              </>
            )}

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

            {Platform.OS === 'web' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
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
              </div>
            ) : (
              <>
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
              </>
            )}

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

          {/* Spacer for edit mode */}
          {isEditing && <View className="mb-8" />}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
