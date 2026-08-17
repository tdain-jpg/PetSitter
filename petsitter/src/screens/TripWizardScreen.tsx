import { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  Button,
  Card,
  Icon,
  Input,
  ScreenHeader,
  ScreenContainer,
  speciesIconName,
} from '../components';
import { useData, useAuth } from '../contexts';
import { showAlert } from '../lib/showAlert';
import { showConfirm } from '../lib/dialogs';
import { formatDate, isValidDateString } from '../lib/dates';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import { friendlyError } from '../lib/errors';


type Props = NativeStackScreenProps<MainStackParamList, 'TripWizard'>;

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
  // Set once the user tries to leave the dates step, so the "required" errors
  // only appear after an attempt rather than on a pristine form.
  const [datesSubmitAttempted, setDatesSubmitAttempted] = useState(false);

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

  // MERGED-VIEW MODEL: activePets spans every household the user belongs to,
  // but a guide's pets must all live in ONE household — the created guide is
  // placed with its pets, and members of that household can always see every
  // pet it references. The picker locks to the first selected pet's household.
  const lockedHouseholdId = useMemo(() => {
    const firstSelected = activePets.find((p) => selectedPetIds.includes(p.id));
    return firstSelected?.household_id ?? null;
  }, [activePets, selectedPetIds]);

  const isPetLockedOut = (pet: { household_id?: string }) =>
    !!lockedHouseholdId && !!pet.household_id && pet.household_id !== lockedHouseholdId;

  const selectAllPets = () => {
    // Single-household rule: "Select All" fills in every pet in the locked
    // household (or, with nothing selected yet, the first pet's household).
    const target = lockedHouseholdId ?? activePets[0]?.household_id;
    setSelectedPetIds(
      activePets
        .filter((p) => !target || !p.household_id || p.household_id === target)
        .map((p) => p.id)
    );
  };

  const deselectAllPets = () => {
    setSelectedPetIds([]);
  };

  // Inline date validation. Both dates are required, so garbage like
  // "next Tuesday" can never reach the guide and render as "Invalid Date".
  const trimmedStartDate = startDate.trim();
  const trimmedEndDate = endDate.trim();
  const startDateValid = isValidDateString(trimmedStartDate);
  const endDateValid = isValidDateString(trimmedEndDate);
  // Both strings are validated 'YYYY-MM-DD', so lexicographic order matches
  // chronological order — no Date objects needed to compare them.
  const datesInOrder =
    !startDateValid || !endDateValid || trimmedEndDate >= trimmedStartDate;
  const datesStepValid = startDateValid && endDateValid && datesInOrder;

  const startDateError = !trimmedStartDate
    ? datesSubmitAttempted
      ? 'Enter a start date'
      : undefined
    : !startDateValid
      ? 'Enter a real date in YYYY-MM-DD format'
      : undefined;
  const endDateError = !trimmedEndDate
    ? datesSubmitAttempted
      ? 'Enter an end date'
      : undefined
    : !endDateValid
      ? 'Enter a real date in YYYY-MM-DD format'
      : !datesInOrder
        ? 'End date must be on or after the start date'
        : undefined;

  const canProceed = (): boolean => {
    switch (step) {
      case 'pets':
        return selectedPetIds.length > 0;
      // The dates step keeps Next enabled so pressing it can surface the
      // inline errors, rather than leaving a silently disabled button.
      case 'dates':
        return true;
      case 'schedule':
        return true;
      case 'confirm':
        return true;
      default:
        return false;
    }
  };

  const goNext = () => {
    if (step === 'dates') {
      setDatesSubmitAttempted(true);
      if (!datesStepValid) return;
    }
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setStep(steps[nextIndex].key);
    }
  };

  // True once the user has entered anything the exit confirm should protect.
  const hasProgress =
    step !== 'pets' ||
    selectedPetIds.length > 0 ||
    tripTitle.trim() !== '' ||
    trimmedStartDate !== '' ||
    trimmedEndDate !== '' ||
    schedule.special_instructions.trim() !== '';

  const handleExit = async () => {
    if (hasProgress) {
      const confirmed = await showConfirm({
        title: 'Cancel Trip Setup?',
        message: 'Your trip details will be discarded.',
        confirmLabel: 'Discard Trip',
        cancelLabel: 'Keep Editing',
        destructive: true,
      });
      if (!confirmed) return;
    }
    navigation.goBack();
  };

  const goBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setStep(steps[prevIndex].key);
    } else {
      handleExit();
    }
  };

  const handleCreateGuide = async () => {
    if (!user) return;

    // Belt-and-braces: the dates step gates on the same check, but never let
    // an unparseable date reach the guide record from the confirm action.
    if (!datesStepValid) {
      setDatesSubmitAttempted(true);
      setStep('dates');
      return;
    }

    setIsSubmitting(true);
    try {
      // Generate a default title if not provided
      const start = trimmedStartDate;
      const end = trimmedEndDate;
      const title = tripTitle.trim() || `Trip: ${start} - ${end}`;

      // The Guide schema has no dedicated sitter-schedule field, so fold the
      // schedule step (arrival/departure/overnight) into additional_notes —
      // otherwise those answers would be silently discarded.
      const scheduleSummary = schedule.overnight
        ? 'Overnight stay'
        : [
            schedule.arrival_time.trim() &&
              `arrival ${schedule.arrival_time.trim()}`,
            schedule.departure_time.trim() &&
              `departure ${schedule.departure_time.trim()}`,
          ]
            .filter(Boolean)
            .join(', ');
      const additionalNotes = [
        scheduleSummary && `Sitter schedule: ${scheduleSummary}`,
        schedule.special_instructions.trim(),
      ]
        .filter(Boolean)
        .join('\n\n');

      // Create the guide in the same household as its selected pets; without a
      // lock (legacy pets missing household_id) the server default assigns the
      // user's primary household.
      const newGuide = await createGuide({
        user_id: user.id,
        title,
        pet_ids: selectedPetIds,
        ...(lockedHouseholdId ? { household_id: lockedHouseholdId } : {}),
        start_date: start,
        end_date: end,
        emergency_contacts: [],
        home_info: {},
        additional_notes: additionalNotes || undefined,
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
      const message = friendlyError(error, 'Failed to create guide');
      showAlert('Error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedPets = activePets.filter((p) => selectedPetIds.includes(p.id));

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
            <Pressable
              onPress={selectAllPets}
              accessibilityRole="button"
              accessibilityLabel="Select all pets"
            >
              <Text className="text-secondary-600">Select All</Text>
            </Pressable>
            <Pressable
              onPress={deselectAllPets}
              accessibilityRole="button"
              accessibilityLabel="Clear pet selection"
            >
              <Text className="text-tan-500">Clear</Text>
            </Pressable>
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
          {activePets.map((pet) => {
            const selected = selectedPetIds.includes(pet.id);
            const lockedOut = !selected && isPetLockedOut(pet);
            return (
            <Pressable
              key={pet.id}
              onPress={() => togglePet(pet.id)}
              disabled={lockedOut}
              accessibilityRole="checkbox"
              accessibilityLabel={pet.name}
              accessibilityState={{ checked: selected, disabled: lockedOut }}
              className={`rounded-xl p-4 border-2 ${
                selected
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-tan-200 bg-cream-50'
              } ${lockedOut ? 'opacity-40' : ''}`}
            >
              <View className="flex-row items-center">
                <View
                  className={`w-6 h-6 rounded-full border-2 mr-3 items-center justify-center ${
                    selected
                      ? 'border-primary-500 bg-primary-500'
                      : 'border-tan-300'
                  }`}
                >
                  {selected && (
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
                {/* Same commissioned avatar the pet list and pet detail show —
                    the emoji ladder this replaced had no reptile branch, so a
                    gecko fell to a generic paw here while its card showed the
                    gecko. */}
                <Icon name={speciesIconName(pet.species)} size={32} />
              </View>
            </Pressable>
            );
          })}
          {activePets.some((pet) => isPetLockedOut(pet)) && (
            <Text className="text-tan-500 text-sm">
              A guide can only include pets from one household, so pets from
              your other households are unavailable here.
            </Text>
          )}
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
          error={startDateError}
        />

        <Input
          label="End Date *"
          placeholder="YYYY-MM-DD"
          value={endDate}
          onChangeText={setEndDate}
          error={endDateError}
        />
      </Card>

      <View className="mb-4">
        <Text className="text-tan-500 text-sm text-center">
          Tip: Use format YYYY-MM-DD (e.g., 2026-03-15)
        </Text>
      </View>
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
            accessibilityRole="switch"
            accessibilityLabel="Overnight stay"
            accessibilityState={{ checked: schedule.overnight }}
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
              {/* Mirror handleCreateGuide's trimmed inputs so the preview
                  matches the title that actually gets saved. */}
              {tripTitle.trim() || `Trip: ${trimmedStartDate} - ${trimmedEndDate}`}
            </Text>
          </View>
          <View className="flex-row">
            <Text className="text-tan-500 w-24">Dates:</Text>
            <Text className="text-brown-800 flex-1">
              {formatDate(trimmedStartDate)} - {formatDate(trimmedEndDate)}
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
              {/* mr-2 as a style, not a class: Icon takes a style prop. */}
              <Icon
                name={speciesIconName(pet.species)}
                size={28}
                style={{ marginRight: 8 }}
              />
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
        onBack={handleExit}
      />

      {renderStepIndicator()}

      <ScrollView className="flex-1 p-4">
        <ScreenContainer variant="form">{renderContent()}</ScreenContainer>
      </ScrollView>

      {/* Navigation Buttons */}
      <View className="p-4 bg-cream-50 border-t border-tan-200">
        <ScreenContainer variant="form">
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
        </ScreenContainer>
      </View>
    </View>
  );
}
