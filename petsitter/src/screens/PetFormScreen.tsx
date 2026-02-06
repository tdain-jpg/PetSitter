import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  Button,
  Input,
  Select,
  PhotoPicker,
  ScheduleEditor,
  MedicationEditor,
  SymptomCheckerEditor,
  Card,
  ScreenHeader,
  SaveStatusIndicator,
} from '../components';
import { useAutoSave } from '../hooks';
import { useData, useAuth } from '../contexts';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '../navigation/types';
import type { Pet, PetSpecies, PetSex, EnergyLevel, SociabilityLevel, PetPersonality, FeedingSchedule, Medication, VetInfo, Insurance, HealthProtocol } from '../types';

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

const sexOptions = [
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
  { label: 'Unknown', value: 'unknown' },
];

const energyLevelOptions = [
  { label: 'Low - Calm, relaxed', value: 'low' },
  { label: 'Medium - Moderate activity', value: 'medium' },
  { label: 'High - Very active', value: 'high' },
];

const sociabilityOptions = [
  { label: 'Shy - Needs time to warm up', value: 'shy' },
  { label: 'Selective - Picky about friends', value: 'selective' },
  { label: 'Friendly - Generally social', value: 'friendly' },
  { label: 'Very Friendly - Loves everyone', value: 'very_friendly' },
];

interface FormData {
  name: string;
  species: PetSpecies;
  breed: string;
  sex: PetSex;
  is_neutered: boolean;
  nicknames: string;
  age: string;
  weight: string;
  weight_unit: 'lbs' | 'kg';
  color_markings: string;
  microchip_id: string;
  license_tag: string;
  photo_url?: string;
  // Personality
  energy_level: EnergyLevel | '';
  sociability_people: SociabilityLevel | '';
  sociability_pets: SociabilityLevel | '';
  fears: string;
  bad_habits: string;
  comfort_items: string;
  favorite_toys: string;
  known_commands: string;
  // Other
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
  // Insurance
  insurance_provider: string;
  insurance_policy_number: string;
  insurance_claims_phone: string;
  insurance_coverage_notes: string;
  // Health Protocol
  health_protocol?: HealthProtocol;
}

const initialFormData: FormData = {
  name: '',
  species: 'dog',
  breed: '',
  sex: 'unknown',
  is_neutered: false,
  nicknames: '',
  age: '',
  weight: '',
  weight_unit: 'lbs',
  color_markings: '',
  microchip_id: '',
  license_tag: '',
  photo_url: undefined,
  // Personality
  energy_level: '',
  sociability_people: '',
  sociability_pets: '',
  fears: '',
  bad_habits: '',
  comfort_items: '',
  favorite_toys: '',
  known_commands: '',
  // Other
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
  // Insurance
  insurance_provider: '',
  insurance_policy_number: '',
  insurance_claims_phone: '',
  insurance_coverage_notes: '',
  // Health Protocol
  health_protocol: undefined,
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
  const [loading, setLoading] = useState(!!isEditing);
  const [dataLoaded, setDataLoaded] = useState(false);

  // Build pet data from form data object (accepts data as parameter to avoid stale closures)
  const buildPetDataFromForm = useCallback((data: FormData) => {
    if (!user) return null;

    let vet_info: VetInfo | undefined;
    if (data.vet_name || data.vet_clinic || data.vet_phone) {
      vet_info = {
        name: data.vet_name,
        clinic: data.vet_clinic,
        phone: data.vet_phone,
        address: data.vet_address || undefined,
        emergency_phone: data.vet_emergency_phone || undefined,
      };
    }

    // Build personality object if any fields are set
    let personality: PetPersonality | undefined;
    if (
      data.energy_level ||
      data.sociability_people ||
      data.sociability_pets ||
      data.fears ||
      data.bad_habits ||
      data.comfort_items ||
      data.favorite_toys ||
      data.known_commands
    ) {
      personality = {
        energy_level: data.energy_level || undefined,
        sociability_people: data.sociability_people || undefined,
        sociability_pets: data.sociability_pets || undefined,
        fears: data.fears.trim() || undefined,
        bad_habits: data.bad_habits.trim() || undefined,
        comfort_items: data.comfort_items.trim() || undefined,
        favorite_toys: data.favorite_toys.trim() || undefined,
        known_commands: data.known_commands.trim() || undefined,
      };
    }

    // Build insurance object if any fields are set
    let insurance: Insurance | undefined;
    if (data.insurance_provider || data.insurance_policy_number) {
      insurance = {
        provider: data.insurance_provider.trim(),
        policy_number: data.insurance_policy_number.trim(),
        claims_phone: data.insurance_claims_phone.trim() || undefined,
        coverage_notes: data.insurance_coverage_notes.trim() || undefined,
      };
    }

    return {
      user_id: user.id,
      name: data.name.trim(),
      species: data.species,
      breed: data.breed.trim() || undefined,
      sex: data.sex || undefined,
      is_neutered: data.is_neutered || undefined,
      nicknames: data.nicknames.trim() || undefined,
      age: data.age ? Number(data.age) : undefined,
      weight: data.weight ? Number(data.weight) : undefined,
      weight_unit: data.weight_unit,
      color_markings: data.color_markings.trim() || undefined,
      microchip_id: data.microchip_id.trim() || undefined,
      license_tag: data.license_tag.trim() || undefined,
      photo_url: data.photo_url,
      personality,
      medical_notes: data.medical_notes.trim() || undefined,
      behavioral_notes: data.behavioral_notes.trim() || undefined,
      special_instructions: data.special_instructions.trim() || undefined,
      feeding_schedule: data.feeding_schedule,
      medications: data.medications,
      vet_info,
      insurance,
      health_protocol: data.health_protocol,
      status: 'active' as const,
    };
  }, [user]);

  // Convenience wrapper that uses current formData state (for manual submit)
  const buildPetData = useCallback(() => {
    return buildPetDataFromForm(formData);
  }, [formData, buildPetDataFromForm]);

  // Auto-save callback for edit mode - accepts data from useAutoSave to avoid stale closures
  const handleAutoSave = useCallback(async (data: FormData) => {
    if (!petId || !data.name.trim()) return;
    const petData = buildPetDataFromForm(data);
    if (petData) {
      await updatePet(petId, petData);
    }
  }, [petId, buildPetDataFromForm, updatePet]);

  // Create a stable reference for auto-save data
  const autoSaveData = useMemo(() => ({ ...formData }), [formData]);

  // Auto-save hook - only enabled when editing and data is loaded
  const { status: saveStatus, lastSaved, error: saveError } = useAutoSave({
    data: autoSaveData,
    onSave: handleAutoSave,
    debounceMs: 1000,
    enabled: !!isEditing && dataLoaded && !!formData.name.trim(),
  });

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
          sex: pet.sex || 'unknown',
          is_neutered: pet.is_neutered || false,
          nicknames: pet.nicknames || '',
          age: pet.age?.toString() || '',
          weight: pet.weight?.toString() || '',
          weight_unit: pet.weight_unit || 'lbs',
          color_markings: pet.color_markings || '',
          microchip_id: pet.microchip_id || '',
          license_tag: pet.license_tag || '',
          photo_url: pet.photo_url,
          // Personality
          energy_level: pet.personality?.energy_level || '',
          sociability_people: pet.personality?.sociability_people || '',
          sociability_pets: pet.personality?.sociability_pets || '',
          fears: pet.personality?.fears || '',
          bad_habits: pet.personality?.bad_habits || '',
          comfort_items: pet.personality?.comfort_items || '',
          favorite_toys: pet.personality?.favorite_toys || '',
          known_commands: pet.personality?.known_commands || '',
          // Other
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
          // Insurance
          insurance_provider: pet.insurance?.provider || '',
          insurance_policy_number: pet.insurance?.policy_number || '',
          insurance_claims_phone: pet.insurance?.claims_phone || '',
          insurance_coverage_notes: pet.insurance?.coverage_notes || '',
          // Health Protocol
          health_protocol: pet.health_protocol,
        });
        // Mark data as loaded to enable auto-save
        setTimeout(() => setDataLoaded(true), 100);
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
      const petData = buildPetData();
      if (!petData) return;

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
          title={isEditing ? 'Edit Pet' : 'Add Pet'}
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
            <Text className="text-lg font-semibold text-brown-800 mb-4">
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

            <Input
              label="Nicknames"
              placeholder="e.g., Buddy, Bud"
              value={formData.nicknames}
              onChangeText={(v) => updateField('nicknames', v)}
            />

            {Platform.OS === 'web' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Select
                  label="Sex"
                  value={formData.sex}
                  options={sexOptions}
                  onValueChange={(v) => updateField('sex', v as PetSex)}
                />
                <div style={{ display: 'flex', alignItems: 'center', paddingTop: 24 }}>
                  <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formData.is_neutered}
                      onChange={(e) => updateField('is_neutered', e.target.checked)}
                      style={{ marginRight: 8, width: 18, height: 18 }}
                    />
                    <span style={{ fontSize: 14, color: COLORS.brown }}>Spayed/Neutered</span>
                  </label>
                </div>
              </div>
            ) : (
              <>
                <Select
                  label="Sex"
                  value={formData.sex}
                  options={sexOptions}
                  onValueChange={(v) => updateField('sex', v as PetSex)}
                />
                <View className="flex-row items-center mb-4">
                  <Switch
                    value={formData.is_neutered}
                    onValueChange={(v) => updateField('is_neutered', v)}
                  />
                  <Text className="ml-2 text-brown-600">Spayed/Neutered</Text>
                </View>
              </>
            )}

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

            <Input
              label="Color/Markings"
              placeholder="e.g., Golden with white chest"
              value={formData.color_markings}
              onChangeText={(v) => updateField('color_markings', v)}
            />
          </Card>

          {/* Identification */}
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-brown-800 mb-4">
              Identification
            </Text>

            <Input
              label="Microchip ID"
              placeholder="e.g., 985112000123456"
              value={formData.microchip_id}
              onChangeText={(v) => updateField('microchip_id', v)}
            />

            <Input
              label="License Tag"
              placeholder="e.g., County #12345"
              value={formData.license_tag}
              onChangeText={(v) => updateField('license_tag', v)}
            />
          </Card>

          {/* Personality */}
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-brown-800 mb-4">
              Personality & Behavior
            </Text>

            <Select
              label="Energy Level"
              value={formData.energy_level}
              options={[{ label: 'Select...', value: '' }, ...energyLevelOptions]}
              onValueChange={(v) => updateField('energy_level', v as EnergyLevel | '')}
            />

            <Select
              label="Sociability with People"
              value={formData.sociability_people}
              options={[{ label: 'Select...', value: '' }, ...sociabilityOptions]}
              onValueChange={(v) => updateField('sociability_people', v as SociabilityLevel | '')}
            />

            <Select
              label="Sociability with Other Pets"
              value={formData.sociability_pets}
              options={[{ label: 'Select...', value: '' }, ...sociabilityOptions]}
              onValueChange={(v) => updateField('sociability_pets', v as SociabilityLevel | '')}
            />

            <Input
              label="Fears"
              placeholder="e.g., Thunderstorms, vacuum cleaner"
              value={formData.fears}
              onChangeText={(v) => updateField('fears', v)}
            />

            <Input
              label="Bad Habits"
              placeholder="e.g., Jumps on guests, begs for food"
              value={formData.bad_habits}
              onChangeText={(v) => updateField('bad_habits', v)}
            />

            <Input
              label="Comfort Items"
              placeholder="e.g., Blue blanket, squeaky toy"
              value={formData.comfort_items}
              onChangeText={(v) => updateField('comfort_items', v)}
            />

            <Input
              label="Favorite Toys"
              placeholder="e.g., Tennis ball, rope toy"
              value={formData.favorite_toys}
              onChangeText={(v) => updateField('favorite_toys', v)}
            />

            <Input
              label="Known Commands"
              placeholder="e.g., Sit, stay, come, down"
              value={formData.known_commands}
              onChangeText={(v) => updateField('known_commands', v)}
            />
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
            <Text className="text-lg font-semibold text-brown-800 mb-4">
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

          {/* Insurance */}
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-brown-800 mb-4">
              Pet Insurance
            </Text>

            <Input
              label="Insurance Provider"
              placeholder="e.g., Healthy Paws, Nationwide"
              value={formData.insurance_provider}
              onChangeText={(v) => updateField('insurance_provider', v)}
            />

            <Input
              label="Policy Number"
              placeholder="e.g., POL-12345678"
              value={formData.insurance_policy_number}
              onChangeText={(v) => updateField('insurance_policy_number', v)}
            />

            <Input
              label="Claims Phone"
              placeholder="(800) 555-1234"
              value={formData.insurance_claims_phone}
              onChangeText={(v) => updateField('insurance_claims_phone', v)}
              formatAsPhone
            />

            <Input
              label="Coverage Notes"
              placeholder="e.g., 80% reimbursement, $500 deductible"
              value={formData.insurance_coverage_notes}
              onChangeText={(v) => updateField('insurance_coverage_notes', v)}
              multiline
              numberOfLines={2}
            />
          </Card>

          {/* Health Protocol / Symptom Checker */}
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-brown-800 mb-4">
              Health Alerts
            </Text>
            <SymptomCheckerEditor
              value={formData.health_protocol}
              onChange={(value) => updateField('health_protocol', value)}
            />
          </Card>

          {/* Notes */}
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-brown-800 mb-4">
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

          {/* Submit Button - only show for new pets, edit mode uses auto-save */}
          {!isEditing && (
            <View className="mb-8">
              <Button
                title="Add Pet"
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
