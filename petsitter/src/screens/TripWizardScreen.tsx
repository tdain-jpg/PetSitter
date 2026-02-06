import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Platform,
  Pressable,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, Input, ScreenHeader } from '../components';
import { useData, useAuth } from '../contexts';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '../navigation/types';
import type { Pet } from '../types';

type Props = NativeStackScreenProps<MainTabParamList, 'TripWizard'>;

type WizardStep = 'pets' | 'dates' | 'schedule' | 'confirm';

interface SitterSchedule {
  arrival_time: string;
  departure_time: string;
  overnight: boolean;
  special_instructions: string;
}

export function TripWizardScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { activePets, createGuide } = useData();

  const [step, setStep] = useState<WizardStep>('pets');
  const [selectedPetIds, setSelectedPetIds] = useState<string[]>([]);
  const [tripTitle, setTripTitle] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [schedule, setSchedule] = useState<SitterSchedule>({
    arrival_time: '08:00',
    departure_time: '18:00',
    overnight: false,
    special_instructions: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const steps: { key: WizardStep; label: string; number: number }[] = [
    { key: 'pets', label: 'Select Pets', number: 1 },
    { key: 'dates', label: 'Trip Dates', number: 2 },
    { key: 'schedule', label: 'Sitter Schedule', number: 3 },
    { key: 'confirm', label: 'Confirm', number: 4 },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  const togglePet = (petId: string) => {
    setSelectedPetIds((prev) =>
      prev.includes(petId)
        ? prev.filter((id) => id !== petId)
        : [...prev, petId]
    );
  };

  const selectAllPets = () => {
    setSelectedPetIds(activePets.map((p) => p.id));
  };

  const deselectAllPets = () => {
    setSelectedPetIds([]);
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 'pets':
        return selectedPetIds.length > 0;
      case 'dates':
        return startDate.trim() !== '' && endDate.trim() !== '';
      case 'schedule':
        return true;
      case 'confirm':
        return true;
      default:
        return false;
    }
  };

  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setStep(steps[nextIndex].key);
    }
  };

  const goBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setStep(steps[prevIndex].key);
    } else {
      navigation.goBack();
    }
  };

  const handleCreateGuide = async () => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      // Generate a default title if not provided
      const title = tripTitle.trim() || `Trip: ${startDate} - ${endDate}`;

      const newGuide = await createGuide({
        user_id: user.id,
        title,
        pet_ids: selectedPetIds,
        start_date: startDate,
        end_date: endDate,
        emergency_contacts: [],
        home_info: {},
        additional_notes: schedule.special_instructions || undefined,
      });

      // Navigate to the new guide detail
      (navigation as any).reset({
        index: 1,
        routes: [
          { name: 'Home' },
          { name: 'GuideDetail', params: { guideId: newGuide.id } },
        ],
      });
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

  const selectedPets = activePets.filter((p) => selectedPetIds.includes(p.id));

  const formatDateForDisplay = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderStepIndicator = () => (
    <View className="flex-row justify-center items-center py-4 px-4 bg-cream-50 border-b border-tan-200">
      {steps.map((s, idx) => (
        <View key={s.key} className="flex-row items-center">
          <View
            className={`w-8 h-8 rounded-full items-center justify-center ${
              idx <= currentStepIndex ? 'bg-primary-500' : 'bg-tan-200'
            }`}
          >
            <Text
              className={`font-semibold ${
                idx <= currentStepIndex ? 'text-white' : 'text-tan-500'
              }`}
            >
              {s.number}
            </Text>
          </View>
          {idx < steps.length - 1 && (
            <View
              className={`w-8 h-1 mx-1 ${
                idx < currentStepIndex ? 'bg-primary-500' : 'bg-tan-200'
              }`}
            />
          )}
        </View>
      ))}
    </View>
  );

  const renderPetsStep = () => (
    <View className="flex-1">
      <View className="flex-row justify-between items-center mb-4">
        <Text className="text-lg font-semibold text-brown-800">
          Which pets need care?
        </Text>
        {activePets.length > 0 && (
          <View className="flex-row gap-2">
            {Platform.OS === 'web' ? (
              <>
                <button
                  onClick={selectAllPets}
                  style={{
                    padding: '4px 12px',
                    backgroundColor: 'transparent',
                    color: COLORS.secondary,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  Select All
                </button>
                <button
                  onClick={deselectAllPets}
                  style={{
                    padding: '4px 12px',
                    backgroundColor: 'transparent',
                    color: COLORS.tan,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  Clear
                </button>
              </>
            ) : (
              <>
                <Pressable onPress={selectAllPets}>
                  <Text className="text-secondary-600">Select All</Text>
                </Pressable>
                <Pressable onPress={deselectAllPets}>
                  <Text className="text-tan-500">Clear</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </View>

      {activePets.length === 0 ? (
        <Card className="items-center py-8">
          <Text className="text-5xl mb-4">🐾</Text>
          <Text className="text-tan-500 text-center mb-4">
            No pets found. Add a pet first to create a care guide.
          </Text>
          <Button
            title="Add Pet"
            onPress={() => (navigation as any).navigate('PetForm', { mode: 'create' })}
            variant="primary"
          />
        </Card>
      ) : (
        <View className="gap-3">
          {activePets.map((pet) => (
            <Pressable
              key={pet.id}
              onPress={() => togglePet(pet.id)}
              className={`rounded-xl p-4 border-2 ${
                selectedPetIds.includes(pet.id)
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-tan-200 bg-cream-50'
              }`}
            >
              <View className="flex-row items-center">
                <View
                  className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
                    selectedPetIds.includes(pet.id)
                      ? 'border-primary-500 bg-primary-500'
                      : 'border-tan-300'
                  }`}
                >
                  {selectedPetIds.includes(pet.id) && (
                    <Text className="text-white text-xs">✓</Text>
                  )}
                </View>
                <View className="flex-1">
                  <Text className="text-lg font-semibold text-brown-800">
                    {pet.name}
                  </Text>
                  <Text className="text-tan-500 capitalize">
                    {pet.species}
                    {pet.breed && ` - ${pet.breed}`}
                  </Text>
                </View>
                <Text className="text-3xl">
                  {pet.species === 'dog' ? '🐕' :
                   pet.species === 'cat' ? '🐈' :
                   pet.species === 'bird' ? '🐦' :
                   pet.species === 'fish' ? '🐟' :
                   pet.species === 'rabbit' ? '🐰' :
                   pet.species === 'hamster' ? '🐹' : '🐾'}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {selectedPetIds.length > 0 && (
        <Text className="text-tan-500 text-center mt-4">
          {selectedPetIds.length} pet{selectedPetIds.length !== 1 ? 's' : ''} selected
        </Text>
      )}
    </View>
  );

  const renderDatesStep = () => (
    <View className="flex-1">
      <Text className="text-lg font-semibold text-brown-800 mb-4">
        When is your trip?
      </Text>

      <Card className="mb-4">
        <Input
          label="Trip Name (optional)"
          placeholder="e.g., Spring Vacation 2026"
          value={tripTitle}
          onChangeText={setTripTitle}
        />

        <Input
          label="Start Date *"
          placeholder="YYYY-MM-DD"
          value={startDate}
          onChangeText={setStartDate}
          keyboardType={Platform.OS === 'web' ? undefined : 'default'}
        />

        <Input
          label="End Date *"
          placeholder="YYYY-MM-DD"
          value={endDate}
          onChangeText={setEndDate}
          keyboardType={Platform.OS === 'web' ? undefined : 'default'}
        />
      </Card>

      {Platform.OS === 'web' && (
        <View className="mb-4">
          <Text className="text-tan-500 text-sm text-center">
            Tip: Use format YYYY-MM-DD (e.g., 2026-03-15)
          </Text>
        </View>
      )}
    </View>
  );

  const renderScheduleStep = () => (
    <View className="flex-1">
      <Text className="text-lg font-semibold text-brown-800 mb-4">
        Sitter Schedule
      </Text>

      <Card className="mb-4">
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-brown-700">Overnight Stay?</Text>
          <Pressable
            onPress={() => setSchedule((prev) => ({ ...prev, overnight: !prev.overnight }))}
            className={`w-12 h-7 rounded-full justify-center ${
              schedule.overnight ? 'bg-primary-500' : 'bg-tan-200'
            }`}
          >
            <View
              className={`w-5 h-5 rounded-full bg-white mx-1 ${
                schedule.overnight ? 'self-end' : 'self-start'
              }`}
            />
          </Pressable>
        </View>

        {!schedule.overnight && (
          <>
            <Input
              label="Arrival Time"
              placeholder="08:00"
              value={schedule.arrival_time}
              onChangeText={(v) => setSchedule((prev) => ({ ...prev, arrival_time: v }))}
            />

            <Input
              label="Departure Time"
              placeholder="18:00"
              value={schedule.departure_time}
              onChangeText={(v) => setSchedule((prev) => ({ ...prev, departure_time: v }))}
            />
          </>
        )}

        <Input
          label="Special Instructions for Sitter"
          placeholder="e.g., Please water the plants, bring in mail..."
          value={schedule.special_instructions}
          onChangeText={(v) => setSchedule((prev) => ({ ...prev, special_instructions: v }))}
          multiline
          numberOfLines={3}
        />
      </Card>
    </View>
  );

  const renderConfirmStep = () => (
    <View className="flex-1">
      <Text className="text-lg font-semibold text-brown-800 mb-4">
        Review & Create Guide
      </Text>

      <Card className="mb-4">
        <Text className="text-brown-700 font-medium mb-2">Trip Details</Text>
        <View className="gap-2">
          <View className="flex-row">
            <Text className="text-tan-500 w-24">Title:</Text>
            <Text className="text-brown-800 flex-1">
              {tripTitle || `Trip: ${startDate} - ${endDate}`}
            </Text>
          </View>
          <View className="flex-row">
            <Text className="text-tan-500 w-24">Dates:</Text>
            <Text className="text-brown-800 flex-1">
              {formatDateForDisplay(startDate)} - {formatDateForDisplay(endDate)}
            </Text>
          </View>
          <View className="flex-row">
            <Text className="text-tan-500 w-24">Sitter:</Text>
            <Text className="text-brown-800 flex-1">
              {schedule.overnight
                ? 'Overnight stay'
                : `${schedule.arrival_time} - ${schedule.departure_time}`}
            </Text>
          </View>
        </View>
      </Card>

      <Card className="mb-4">
        <Text className="text-brown-700 font-medium mb-2">
          Pets ({selectedPets.length})
        </Text>
        <View className="gap-2">
          {selectedPets.map((pet) => (
            <View key={pet.id} className="flex-row items-center">
              <Text className="text-2xl mr-2">
                {pet.species === 'dog' ? '🐕' :
                 pet.species === 'cat' ? '🐈' :
                 pet.species === 'bird' ? '🐦' :
                 pet.species === 'fish' ? '🐟' :
                 pet.species === 'rabbit' ? '🐰' :
                 pet.species === 'hamster' ? '🐹' : '🐾'}
              </Text>
              <Text className="text-brown-800">{pet.name}</Text>
            </View>
          ))}
        </View>
      </Card>

      {schedule.special_instructions && (
        <Card className="mb-4">
          <Text className="text-brown-700 font-medium mb-2">Special Instructions</Text>
          <Text className="text-tan-600">{schedule.special_instructions}</Text>
        </Card>
      )}

      <View className="bg-primary-50 rounded-xl p-4 border border-primary-200">
        <Text className="text-brown-700 text-center">
          After creating, you can add emergency contacts, home info, and more from the guide detail screen.
        </Text>
      </View>
    </View>
  );

  const renderContent = () => {
    switch (step) {
      case 'pets':
        return renderPetsStep();
      case 'dates':
        return renderDatesStep();
      case 'schedule':
        return renderScheduleStep();
      case 'confirm':
        return renderConfirmStep();
      default:
        return null;
    }
  };

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      <ScreenHeader
        title="Quick Trip Setup"
        backLabel="Cancel"
        onBack={() => navigation.goBack()}
      />

      {renderStepIndicator()}

      <ScrollView className="flex-1 p-4">{renderContent()}</ScrollView>

      {/* Navigation Buttons */}
      <View className="p-4 bg-cream-50 border-t border-tan-200">
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button
              title={currentStepIndex === 0 ? 'Cancel' : 'Back'}
              onPress={goBack}
              variant="outline"
            />
          </View>
          <View className="flex-1">
            {step === 'confirm' ? (
              <Button
                title="Create Guide"
                onPress={handleCreateGuide}
                loading={isSubmitting}
                disabled={isSubmitting}
              />
            ) : (
              <Button
                title="Next"
                onPress={goNext}
                disabled={!canProceed()}
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );
}
