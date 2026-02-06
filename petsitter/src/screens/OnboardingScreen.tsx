import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Pressable,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Input, Select, Card } from '../components';
import { useData, useAuth } from '../contexts';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '../navigation/types';
import type { PetSpecies, OnboardingStep } from '../types';
import { generateId, getCurrentTimestamp } from '../services/DataService';

type Props = NativeStackScreenProps<MainTabParamList, 'Onboarding'>;

const STEPS: OnboardingStep[] = ['welcome', 'create_pet', 'create_guide', 'completion'];

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

interface PetFormData {
  name: string;
  species: PetSpecies;
  breed: string;
  age: string;
}

interface GuideFormData {
  title: string;
  address: string;
  emergencyName: string;
  emergencyPhone: string;
}

export function OnboardingScreen({ navigation }: Props) {
  const { user } = useAuth();
  const {
    createPet,
    createGuide,
    updateOnboardingState,
    completeOnboarding,
    onboardingState,
  } = useData();

  const [currentStep, setCurrentStep] = useState<OnboardingStep>(
    onboardingState?.current_step || 'welcome'
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdPetId, setCreatedPetId] = useState<string | undefined>(
    onboardingState?.first_pet_id
  );
  const [createdGuideId, setCreatedGuideId] = useState<string | undefined>(
    onboardingState?.first_guide_id
  );

  // Pet form state
  const [petForm, setPetForm] = useState<PetFormData>({
    name: '',
    species: 'dog',
    breed: '',
    age: '',
  });
  const [petErrors, setPetErrors] = useState<Partial<PetFormData>>({});

  // Guide form state
  const [guideForm, setGuideForm] = useState<GuideFormData>({
    title: '',
    address: '',
    emergencyName: '',
    emergencyPhone: '',
  });
  const [guideErrors, setGuideErrors] = useState<Partial<GuideFormData>>({});

  const currentStepIndex = STEPS.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  const goToStep = useCallback(
    async (step: OnboardingStep) => {
      setCurrentStep(step);
      await updateOnboardingState({
        current_step: step,
        completed_steps: STEPS.slice(0, STEPS.indexOf(step)),
        first_pet_id: createdPetId,
        first_guide_id: createdGuideId,
      });
    },
    [updateOnboardingState, createdPetId, createdGuideId]
  );

  const handleCreatePet = async () => {
    if (!user) return;

    // Validate
    const errors: Partial<PetFormData> = {};
    if (!petForm.name.trim()) errors.name = 'Name is required';
    setPetErrors(errors);

    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      const pet = await createPet({
        user_id: user.id,
        name: petForm.name.trim(),
        species: petForm.species,
        breed: petForm.breed.trim() || undefined,
        age: petForm.age ? Number(petForm.age) : undefined,
        feeding_schedule: [],
        medications: [],
        status: 'active',
      });
      setCreatedPetId(pet.id);
      await goToStep('create_guide');
    } catch (error: any) {
      const message = error.message || 'Failed to create pet';
      if (Platform.OS === 'web') {
        alert(message);
      } else {
        Alert.alert('Error', message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateGuide = async () => {
    if (!user || !createdPetId) return;

    // Validate
    const errors: Partial<GuideFormData> = {};
    if (!guideForm.title.trim()) errors.title = 'Title is required';
    setGuideErrors(errors);

    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    try {
      const guide = await createGuide({
        user_id: user.id,
        title: guideForm.title.trim(),
        pet_ids: [createdPetId],
        emergency_contacts: guideForm.emergencyName
          ? [
              {
                id: generateId(),
                name: guideForm.emergencyName.trim(),
                phone: guideForm.emergencyPhone.trim(),
                relationship: 'Emergency Contact',
                is_primary: true,
              },
            ]
          : [],
        home_info: {
          address: guideForm.address.trim() || undefined,
        },
      });
      setCreatedGuideId(guide.id);
      await goToStep('completion');
    } catch (error: any) {
      const message = error.message || 'Failed to create guide';
      if (Platform.OS === 'web') {
        alert(message);
      } else {
        Alert.alert('Error', message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      await completeOnboarding();
      navigation.replace('Home');
    } catch (error: any) {
      const message = error.message || 'Failed to complete onboarding';
      if (Platform.OS === 'web') {
        alert(message);
      } else {
        Alert.alert('Error', message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = async () => {
    const confirmSkip = async () => {
      await completeOnboarding();
      navigation.replace('Home');
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Skip onboarding? You can add pets and guides later from the main menu.')) {
        confirmSkip();
      }
    } else {
      Alert.alert(
        'Skip Onboarding?',
        'You can add pets and guides later from the main menu.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Skip', onPress: confirmSkip },
        ]
      );
    }
  };

  // Render step content directly (not as components to avoid focus loss)
  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return (
          <View className="flex-1 justify-center items-center px-8">
            <View className="w-24 h-24 bg-secondary-100 rounded-full items-center justify-center mb-6">
              <Text className="text-5xl">🐾</Text>
            </View>
            <Text className="text-3xl font-bold text-brown-800 text-center mb-4">
              Welcome to Pet Sitter Guide Pro!
            </Text>
            <Text className="text-lg text-tan-600 text-center mb-8">
              Create comprehensive pet care guides for your pet sitters. Let's get started by setting up your first pet and guide.
            </Text>
            <View className="w-full gap-3">
              <Button
                title="Get Started"
                onPress={() => goToStep('create_pet')}
                variant="primary"
              />
              <Button
                title="Skip for Now"
                onPress={handleSkip}
                variant="outline"
              />
            </View>
          </View>
        );

      case 'create_pet':
        return (
          <ScrollView className="flex-1 p-4" keyboardShouldPersistTaps="handled">
            <View className="items-center mb-6">
              <View className="w-20 h-20 bg-primary-100 rounded-full items-center justify-center mb-4">
                <Text className="text-4xl">🐕</Text>
              </View>
              <Text className="text-2xl font-bold text-brown-800 text-center">
                Add Your First Pet
              </Text>
              <Text className="text-tan-600 text-center mt-2">
                Tell us about your furry (or scaly) friend
              </Text>
            </View>

            <Card className="mb-4">
              <Input
                label="Pet Name *"
                placeholder="e.g., Buddy, Luna, Max"
                value={petForm.name}
                onChangeText={(v) => {
                  setPetForm((prev) => ({ ...prev, name: v }));
                  if (petErrors.name) setPetErrors((prev) => ({ ...prev, name: undefined }));
                }}
                error={petErrors.name}
              />

              <Select
                label="Species *"
                value={petForm.species}
                options={speciesOptions}
                onValueChange={(v) => setPetForm((prev) => ({ ...prev, species: v as PetSpecies }))}
              />

              <Input
                label="Breed (Optional)"
                placeholder="e.g., Golden Retriever, Siamese"
                value={petForm.breed}
                onChangeText={(v) => setPetForm((prev) => ({ ...prev, breed: v }))}
              />

              <Input
                label="Age in Years (Optional)"
                placeholder="e.g., 3"
                value={petForm.age}
                onChangeText={(v) => setPetForm((prev) => ({ ...prev, age: v }))}
                keyboardType="numeric"
              />
            </Card>

            <Text className="text-sm text-tan-500 text-center mb-4">
              Don't worry - you can add more details like feeding schedules, medications, and vet info later.
            </Text>

            <View className="gap-3 mb-8">
              <Button
                title="Continue"
                onPress={handleCreatePet}
                loading={isSubmitting}
                disabled={isSubmitting}
              />
              <Button
                title="Skip for Now"
                onPress={handleSkip}
                variant="outline"
                disabled={isSubmitting}
              />
            </View>
          </ScrollView>
        );

      case 'create_guide':
        return (
          <ScrollView className="flex-1 p-4" keyboardShouldPersistTaps="handled">
            <View className="items-center mb-6">
              <View className="w-20 h-20 bg-purple-100 rounded-full items-center justify-center mb-4">
                <Text className="text-4xl">📋</Text>
              </View>
              <Text className="text-2xl font-bold text-brown-800 text-center">
                Create Your First Guide
              </Text>
              <Text className="text-tan-600 text-center mt-2">
                Set up a care guide for {petForm.name || 'your pet'}
              </Text>
            </View>

            <Card className="mb-4">
              <Input
                label="Guide Title *"
                placeholder="e.g., Weekend Trip Care, Summer Vacation"
                value={guideForm.title}
                onChangeText={(v) => {
                  setGuideForm((prev) => ({ ...prev, title: v }));
                  if (guideErrors.title) setGuideErrors((prev) => ({ ...prev, title: undefined }));
                }}
                error={guideErrors.title}
              />

              <Input
                label="Home Address (Optional)"
                placeholder="123 Main St, City, State"
                value={guideForm.address}
                onChangeText={(v) => setGuideForm((prev) => ({ ...prev, address: v }))}
              />
            </Card>

            <Card className="mb-4">
              <Text className="text-lg font-semibold text-brown-800 mb-4">
                Emergency Contact (Optional)
              </Text>

              <Input
                label="Contact Name"
                placeholder="e.g., Dr. Smith (Vet)"
                value={guideForm.emergencyName}
                onChangeText={(v) => setGuideForm((prev) => ({ ...prev, emergencyName: v }))}
              />

              <Input
                label="Phone Number"
                placeholder="(555) 123-4567"
                value={guideForm.emergencyPhone}
                onChangeText={(v) => setGuideForm((prev) => ({ ...prev, emergencyPhone: v }))}
                formatAsPhone
              />
            </Card>

            <Text className="text-sm text-tan-500 text-center mb-4">
              You can add WiFi passwords, door codes, and detailed schedules later.
            </Text>

            <View className="gap-3 mb-8">
              <Button
                title="Create Guide"
                onPress={handleCreateGuide}
                loading={isSubmitting}
                disabled={isSubmitting}
              />
              <Button
                title="Go Back"
                onPress={() => goToStep('create_pet')}
                variant="outline"
                disabled={isSubmitting}
              />
            </View>
          </ScrollView>
        );

      case 'completion':
        return (
          <View className="flex-1 justify-center items-center px-8">
            <View className="w-24 h-24 bg-primary-100 rounded-full items-center justify-center mb-6">
              <Text className="text-5xl">🎉</Text>
            </View>
            <Text className="text-3xl font-bold text-brown-800 text-center mb-4">
              You're All Set!
            </Text>
            <Text className="text-lg text-tan-600 text-center mb-2">
              Great job! You've created your first pet profile and care guide.
            </Text>
            <Text className="text-tan-500 text-center mb-8">
              You can now add more details, share your guide with pet sitters, or generate an AI cheat sheet.
            </Text>

            <Card className="w-full mb-6">
              <View className="flex-row items-center mb-4">
                <View className="w-12 h-12 bg-primary-100 rounded-full items-center justify-center mr-3">
                  <Text className="text-2xl">✓</Text>
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-brown-800">{petForm.name}</Text>
                  <Text className="text-tan-500 text-sm">Pet profile created</Text>
                </View>
              </View>
              <View className="flex-row items-center">
                <View className="w-12 h-12 bg-primary-100 rounded-full items-center justify-center mr-3">
                  <Text className="text-2xl">✓</Text>
                </View>
                <View className="flex-1">
                  <Text className="font-semibold text-brown-800">{guideForm.title}</Text>
                  <Text className="text-tan-500 text-sm">Care guide created</Text>
                </View>
              </View>
            </Card>

            <View className="w-full gap-3">
              <Button
                title="Go to Dashboard"
                onPress={handleComplete}
                loading={isSubmitting}
                disabled={isSubmitting}
              />
              {createdGuideId && (
                <Button
                  title="View Your Guide"
                  onPress={() => {
                    completeOnboarding();
                    (navigation as any).navigate('GuideDetail', { guideId: createdGuideId });
                  }}
                  variant="outline"
                  disabled={isSubmitting}
                />
              )}
            </View>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
    >
      <View className="flex-1 bg-cream-200">
        <StatusBar style="dark" />

        {/* Header with Progress */}
        <View className="bg-cream-50 border-b border-tan-200 pt-12 pb-4">
          <Text className="text-center text-lg font-semibold text-brown-800 mb-2">
            Setup Wizard
          </Text>
          <View className="px-4 pt-4">
            <View className="flex-row justify-between mb-2">
              {STEPS.map((step, index) => (
                <View
                  key={step}
                  className={`w-3 h-3 rounded-full ${
                    index <= currentStepIndex ? 'bg-secondary-600' : 'bg-tan-300'
                  }`}
                />
              ))}
            </View>
            <View className="h-1 bg-tan-200 rounded-full overflow-hidden">
              <View
                className="h-full bg-secondary-600 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </View>
            <Text className="text-center text-sm text-tan-500 mt-2">
              Step {currentStepIndex + 1} of {STEPS.length}
            </Text>
          </View>
        </View>

        {/* Step Content */}
        {renderStep()}
      </View>
    </KeyboardAvoidingView>
  );
}
