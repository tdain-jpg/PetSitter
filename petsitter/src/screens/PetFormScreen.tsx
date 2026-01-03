import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  Button,
  Input,
  Select,
  PhotoPicker,
  ScheduleEditor,
  MedicationEditor,
  Card,
} from '../components';
import { useData, useAuth } from '../contexts';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '../navigation/types';
import type { Pet, PetSpecies, FeedingSchedule, Medication, VetInfo } from '../types';

type Props = NativeStackScreenProps<MainTabParamList, 'PetForm'>;

const speciesOptions = [
  { label: 'Dog', value: 'dog' },
  { label: 'Cat', value: 'cat' },
  { label: 'Bird', value: 'bird' },
  { label: 'Fish', value: 'fish' },
  { label: 'Reptile', value: 'reptile' },
  { label: 'Rabbit', value: 'rabbit' },
  { label: 'Hamster', value: 'hamster' },
  { label: 'Other', value: 'other' },
];

const weightUnitOptions = [
  { label: 'Pounds (lbs)', value: 'lbs' },
  { label: 'Kilograms (kg)', value: 'kg' },
];

interface FormData {
  name: string;
  species: PetSpecies;
  breed: string;
  age: string;
  weight: string;
  weight_unit: 'lbs' | 'kg';
  photo_url?: string;
  medical_notes: string;
  behavioral_notes: string;
  special_instructions: string;
  feeding_schedule: FeedingSchedule[];
  medications: Medication[];
  vet_name: string;
  vet_clinic: string;
  vet_phone: string;
  vet_address: string;
  vet_emergency_phone: string;
}

const initialFormData: FormData = {
  name: '',
  species: 'dog',
  breed: '',
  age: '',
  weight: '',
  weight_unit: 'lbs',
  photo_url: undefined,
  medical_notes: '',
  behavioral_notes: '',
  special_instructions: '',
  feeding_schedule: [],
  medications: [],
  vet_name: '',
  vet_clinic: '',
  vet_phone: '',
  vet_address: '',
  vet_emergency_phone: '',
};

export function PetFormScreen({ navigation, route }: Props) {
  const params = route.params;
  const mode = params.mode;
  const petId = params.mode === 'edit' ? params.petId : undefined;
  const isEditing = mode === 'edit' && petId;

  const { user } = useAuth();
  const { activePets, deceasedPets, createPet, updatePet } = useData();

  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEditing);

  // Load existing pet data for editing
  useEffect(() => {
    if (isEditing && petId) {
      const allPets = [...activePets, ...deceasedPets];
      const pet = allPets.find((p) => p.id === petId);
      if (pet) {
        setFormData({
          name: pet.name,
          species: pet.species,
          breed: pet.breed || '',
          age: pet.age?.toString() || '',
          weight: pet.weight?.toString() || '',
          weight_unit: pet.weight_unit || 'lbs',
          photo_url: pet.photo_url,
          medical_notes: pet.medical_notes || '',
          behavioral_notes: pet.behavioral_notes || '',
          special_instructions: pet.special_instructions || '',
          feeding_schedule: pet.feeding_schedule,
          medications: pet.medications,
          vet_name: pet.vet_info?.name || '',
          vet_clinic: pet.vet_info?.clinic || '',
          vet_phone: pet.vet_info?.phone || '',
          vet_address: pet.vet_info?.address || '',
          vet_emergency_phone: pet.vet_info?.emergency_phone || '',
        });
      }
      setLoading(false);
    }
  }, [isEditing, petId, activePets, deceasedPets]);

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when field is updated
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.species) {
      newErrors.species = 'Species is required';
    }

    if (formData.age && isNaN(Number(formData.age))) {
      newErrors.age = 'Age must be a number';
    }

    if (formData.weight && isNaN(Number(formData.weight))) {
      newErrors.weight = 'Weight must be a number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!user) return;

    setIsSubmitting(true);

    try {
      // Build vet info if any vet fields are filled
      let vet_info: VetInfo | undefined;
      if (formData.vet_name || formData.vet_clinic || formData.vet_phone) {
        vet_info = {
          name: formData.vet_name,
          clinic: formData.vet_clinic,
          phone: formData.vet_phone,
          address: formData.vet_address || undefined,
          emergency_phone: formData.vet_emergency_phone || undefined,
        };
      }

      const petData = {
        user_id: user.id,
        name: formData.name.trim(),
        species: formData.species,
        breed: formData.breed.trim() || undefined,
        age: formData.age ? Number(formData.age) : undefined,
        weight: formData.weight ? Number(formData.weight) : undefined,
        weight_unit: formData.weight_unit,
        photo_url: formData.photo_url,
        medical_notes: formData.medical_notes.trim() || undefined,
        behavioral_notes: formData.behavioral_notes.trim() || undefined,
        special_instructions: formData.special_instructions.trim() || undefined,
        feeding_schedule: formData.feeding_schedule,
        medications: formData.medications,
        vet_info,
        status: 'active' as const,
      };

      if (isEditing && petId) {
        await updatePet(petId, petData);
      } else {
        await createPet(petData);
      }

      navigation.goBack();
    } catch (error: any) {
      const message = error.message || 'Failed to save pet';
      if (Platform.OS === 'web') {
        alert(message);
      } else {
        Alert.alert('Error', message);
      }
    } finally {
      setIsSubmitting(false);
    }
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
            {isEditing ? 'Edit Pet' : 'Add Pet'}
          </Text>
          <View style={{ width: 70 }} />
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ padding: 16 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Photo */}
          <Card className="mb-4">
            <PhotoPicker
              label="Pet Photo"
              value={formData.photo_url}
              onChange={(uri) => updateField('photo_url', uri)}
            />
          </Card>

          {/* Basic Info */}
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-gray-900 mb-4">
              Basic Information
            </Text>

            <Input
              label="Name *"
              placeholder="Enter pet name"
              value={formData.name}
              onChangeText={(v) => updateField('name', v)}
              error={errors.name}
            />

            <Select
              label="Species *"
              value={formData.species}
              options={speciesOptions}
              onValueChange={(v) => updateField('species', v as PetSpecies)}
              error={errors.species}
            />

            <Input
              label="Breed"
              placeholder="e.g., Golden Retriever"
              value={formData.breed}
              onChangeText={(v) => updateField('breed', v)}
            />

            {Platform.OS === 'web' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Input
                  label="Age (years)"
                  placeholder="e.g., 3"
                  value={formData.age}
                  onChangeText={(v) => updateField('age', v)}
                  keyboardType="numeric"
                  error={errors.age}
                />
                <div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <Input
                        label="Weight"
                        placeholder="e.g., 50"
                        value={formData.weight}
                        onChangeText={(v) => updateField('weight', v)}
                        keyboardType="numeric"
                        error={errors.weight}
                      />
                    </div>
                    <div style={{ width: 120 }}>
                      <Select
                        label="Unit"
                        value={formData.weight_unit}
                        options={weightUnitOptions}
                        onValueChange={(v) => updateField('weight_unit', v as 'lbs' | 'kg')}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <Input
                  label="Age (years)"
                  placeholder="e.g., 3"
                  value={formData.age}
                  onChangeText={(v) => updateField('age', v)}
                  keyboardType="numeric"
                  error={errors.age}
                />
                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Input
                      label="Weight"
                      placeholder="e.g., 50"
                      value={formData.weight}
                      onChangeText={(v) => updateField('weight', v)}
                      keyboardType="numeric"
                      error={errors.weight}
                    />
                  </View>
                  <View style={{ width: 120 }}>
                    <Select
                      label="Unit"
                      value={formData.weight_unit}
                      options={weightUnitOptions}
                      onValueChange={(v) => updateField('weight_unit', v as 'lbs' | 'kg')}
                    />
                  </View>
                </View>
              </>
            )}
          </Card>

          {/* Feeding Schedule */}
          <Card className="mb-4">
            <ScheduleEditor
              label="Feeding Schedule"
              schedules={formData.feeding_schedule}
              onChange={(schedules) => updateField('feeding_schedule', schedules)}
            />
          </Card>

          {/* Medications */}
          <Card className="mb-4">
            <MedicationEditor
              label="Medications"
              medications={formData.medications}
              onChange={(meds) => updateField('medications', meds)}
            />
          </Card>

          {/* Vet Information */}
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-gray-900 mb-4">
              Veterinarian Information
            </Text>

            <Input
              label="Vet Name"
              placeholder="Dr. Smith"
              value={formData.vet_name}
              onChangeText={(v) => updateField('vet_name', v)}
            />

            <Input
              label="Clinic Name"
              placeholder="Happy Paws Clinic"
              value={formData.vet_clinic}
              onChangeText={(v) => updateField('vet_clinic', v)}
            />

            <Input
              label="Phone"
              placeholder="(555) 123-4567"
              value={formData.vet_phone}
              onChangeText={(v) => updateField('vet_phone', v)}
              formatAsPhone
            />

            <Input
              label="Address"
              placeholder="123 Main St"
              value={formData.vet_address}
              onChangeText={(v) => updateField('vet_address', v)}
            />

            <Input
              label="Emergency Phone"
              placeholder="(555) 999-9999"
              value={formData.vet_emergency_phone}
              onChangeText={(v) => updateField('vet_emergency_phone', v)}
              formatAsPhone
            />
          </Card>

          {/* Notes */}
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-gray-900 mb-4">
              Additional Notes
            </Text>

            <Input
              label="Medical Notes"
              placeholder="Any allergies, conditions, etc."
              value={formData.medical_notes}
              onChangeText={(v) => updateField('medical_notes', v)}
              multiline
              numberOfLines={3}
            />

            <Input
              label="Behavioral Notes"
              placeholder="Temperament, quirks, fears, etc."
              value={formData.behavioral_notes}
              onChangeText={(v) => updateField('behavioral_notes', v)}
              multiline
              numberOfLines={3}
            />

            <Input
              label="Special Instructions"
              placeholder="Any other important information"
              value={formData.special_instructions}
              onChangeText={(v) => updateField('special_instructions', v)}
              multiline
              numberOfLines={3}
            />
          </Card>

          {/* Submit Button */}
          <View className="mb-8">
            <Button
              title={isEditing ? 'Save Changes' : 'Add Pet'}
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
