import { useState, useEffect } from 'react';
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
import { Button, Input, Card } from '../components';
import { useData, useAuth } from '../contexts';
import { generateId } from '../services';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '../navigation/types';
import type { Guide, EmergencyContact, HomeInfo, Pet } from '../types';

type Props = NativeStackScreenProps<MainTabParamList, 'GuideForm'>;

interface FormData {
  title: string;
  pet_ids: string[];
  start_date: string;
  end_date: string;
  emergency_contacts: EmergencyContact[];
  home_info: HomeInfo;
  additional_notes: string;
}

const initialFormData: FormData = {
  title: '',
  pet_ids: [],
  start_date: '',
  end_date: '',
  emergency_contacts: [],
  home_info: {},
  additional_notes: '',
};

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
          additional_notes: guide.additional_notes || '',
        });
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
      const guideData: Omit<Guide, 'id' | 'created_at' | 'updated_at'> = {
        user_id: user.id,
        title: formData.title.trim(),
        pet_ids: formData.pet_ids,
        start_date: formData.start_date || undefined,
        end_date: formData.end_date || undefined,
        emergency_contacts: formData.emergency_contacts,
        home_info: formData.home_info,
        additional_notes: formData.additional_notes.trim() || undefined,
      };

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
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
    >
      <View className="flex-1 bg-gray-50">
        <StatusBar style="dark" />

        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pt-12 pb-4 bg-white border-b border-gray-100">
          {Platform.OS === 'web' ? (
            <button
              onClick={() => navigation.goBack()}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                color: '#2563eb',
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
              }}
            >
              Cancel
            </button>
          ) : (
            <Button title="Cancel" onPress={() => navigation.goBack()} variant="outline" />
          )}
          <Text className="text-lg font-semibold text-gray-900">
            {isEditing ? 'Edit Guide' : 'New Guide'}
          </Text>
          <View style={{ width: 70 }} />
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Basic Info */}
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-gray-900 mb-4">
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
                  <label style={{ display: 'block', fontSize: 14, color: '#374151', marginBottom: 8, fontWeight: 500 }}>
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
                  <label style={{ display: 'block', fontSize: 14, color: '#374151', marginBottom: 8, fontWeight: 500 }}>
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
            <Text className="text-lg font-semibold text-gray-900 mb-4">
              Select Pets
            </Text>

            {activePets.length === 0 ? (
              <View className="items-center py-4">
                <Text className="text-gray-500 mb-2">No pets available.</Text>
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
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <View
                      className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
                        formData.pet_ids.includes(pet.id)
                          ? 'bg-primary-500 border-primary-500'
                          : 'border-gray-300'
                      }`}
                    >
                      {formData.pet_ids.includes(pet.id) && (
                        <Text className="text-white text-xs">✓</Text>
                      )}
                    </View>
                    <Text className="text-gray-900 font-medium">{pet.name}</Text>
                    <Text className="text-gray-500 ml-2 capitalize">
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
              <Text className="text-lg font-semibold text-gray-900">
                Emergency Contacts
              </Text>
              {Platform.OS === 'web' ? (
                <button
                  onClick={handleAddContact}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#eff6ff',
                    color: '#2563eb',
                    border: 'none',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12,
                  }}
                >
                  + Add Contact
                </button>
              ) : (
                <Pressable onPress={handleAddContact} className="bg-primary-50 px-3 py-1 rounded">
                  <Text className="text-primary-600 text-sm">+ Add Contact</Text>
                </Pressable>
              )}
            </View>

            {formData.emergency_contacts.length === 0 ? (
              <Text className="text-gray-500">No emergency contacts added.</Text>
            ) : (
              formData.emergency_contacts.map((contact) => (
                <View
                  key={contact.id}
                  className="bg-gray-50 rounded-lg p-3 mb-2 border border-gray-200"
                >
                  <View className="flex-row justify-between items-start">
                    <View className="flex-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="font-semibold text-gray-900">{contact.name}</Text>
                        {contact.is_primary && (
                          <View className="bg-green-100 px-2 py-0.5 rounded-full">
                            <Text className="text-green-600 text-xs">PRIMARY</Text>
                          </View>
                        )}
                      </View>
                      <Text className="text-gray-500">{contact.relationship}</Text>
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
                              color: '#2563eb',
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
                              color: '#dc2626',
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
                            <Text className="text-primary-600 text-sm">Edit</Text>
                          </Pressable>
                          <Pressable onPress={() => handleDeleteContact(contact.id)} className="px-2 py-1">
                            <Text className="text-red-600 text-sm">Delete</Text>
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
              <View className="mt-4 p-4 bg-gray-100 rounded-lg">
                <Text className="font-semibold text-gray-900 mb-3">
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
                  <Text className="ml-2 text-gray-700">Primary Contact</Text>
                </View>
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
            <Text className="text-lg font-semibold text-gray-900 mb-4">
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

          {/* Submit Button */}
          <View className="mb-8">
            <Button
              title={isEditing ? 'Save Changes' : 'Create Guide'}
              onPress={handleSubmit}
              loading={isSubmitting}
              disabled={isSubmitting}
            />
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}
