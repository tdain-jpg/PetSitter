import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Image, Pressable, Linking, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { showAlert, showConfirm } from '../lib/dialogs';
import { todayLocal } from '../lib/dates';
import { Button, SectionHeader, ScreenContainer } from '../components';
import { useData } from '../contexts';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { Pet } from '../types';

type Props = NativeStackScreenProps<MainStackParamList, 'PetDetail'>;

const speciesEmoji: Record<string, string> = {
  dog: '🐕',
  cat: '🐱',
  bird: '🐦',
  fish: '🐟',
  reptile: '🦎',
  rabbit: '🐰',
  hamster: '🐹',
  other: '🐾',
};

/** Label/value row matching the GuideDetail/SharedGuideView style. */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row">
      <Text className="text-tan-500 w-28">{label}:</Text>
      <Text className="text-brown-800 flex-1">{value}</Text>
    </View>
  );
}

/** Label row with a tappable phone number, dialing like ContactCard does. */
function PhoneRow({ label, phone }: { label: string; phone: string }) {
  return (
    <View className="flex-row">
      <Text className="text-tan-500 w-28">{label}:</Text>
      <Pressable
        onPress={() => Linking.openURL(`tel:${phone}`)}
        accessibilityRole="button"
        accessibilityLabel={`Call ${label} at ${phone}`}
        className="flex-1"
      >
        <Text className="text-secondary-600">📞 {phone}</Text>
      </Pressable>
    </View>
  );
}

function titleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PetDetailScreen({ navigation, route }: Props) {
  const { petId } = route.params;
  const { activePets, deceasedPets, loadingPets, deletePet, markPetDeceased, restorePet } =
    useData();

  const [pet, setPet] = useState<Pet | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const allPets = [...activePets, ...deceasedPets];
    const foundPet = allPets.find((p) => p.id === petId);
    setPet(foundPet || null);
    setLoading(false);
  }, [petId, activePets, deceasedPets]);

  const handleEdit = () => {
    (navigation as any).navigate('PetForm', { mode: 'edit', petId });
  };

  const handleDelete = async () => {
    if (!pet) return;
    const ok = await showConfirm({
      title: `Delete ${pet.name}?`,
      message: 'This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    try {
      await deletePet(petId);
      navigation.goBack();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to delete pet');
    }
  };

  const handleMemorial = async () => {
    if (!pet) return;
    const ok = await showConfirm({
      title: 'Move to Memorial',
      message: `Move ${pet.name} to memorial? You can restore them later.`,
      confirmLabel: 'Move',
    });
    if (!ok) return;
    // Local calendar day — toISOString() would stamp tomorrow's date for a
    // user behind UTC late in the evening.
    const today = todayLocal();
    try {
      await markPetDeceased(petId, today);
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to move pet to memorial');
    }
  };

  const handleRestore = async () => {
    try {
      await restorePet(petId);
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to restore pet');
    }
  };

  // Hold the spinner on a deep-link hard reload: the effect runs against
  // empty pet arrays before DataContext's initial fetch resolves, and the
  // not-found state must wait for real data.
  if (loading || (!pet && loadingPets)) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-200">
        <ActivityIndicator size="large" color={COLORS.secondary} />
      </View>
    );
  }

  if (!pet) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-200">
        <Text className="text-xl text-tan-500 mb-4">Pet not found</Text>
        <Button title="Go Back" onPress={() => navigation.goBack()} variant="outline" />
      </View>
    );
  }

  const emoji = speciesEmoji[pet.species] || '🐾';

  // Section gating — only render sections that actually have content.
  const hasBasics = !!(
    (pet.sex && pet.sex !== 'unknown') ||
    pet.is_neutered ||
    pet.weight ||
    pet.color_markings ||
    pet.nicknames
  );
  const hasIdentification = !!(pet.microchip_id || pet.license_tag);
  const personality = pet.personality;
  const hasPersonality =
    !!personality && Object.values(personality).some((v) => !!v);
  const hasHealthVet = !!(pet.vet_info || pet.medical_notes);
  const enabledSymptoms =
    pet.health_protocol?.symptoms.filter((s) => s.is_enabled) ?? [];
  const hasHealthProtocol = !!(
    pet.health_protocol &&
    (enabledSymptoms.length > 0 ||
      pet.health_protocol.general_notes ||
      pet.health_protocol.vet_call_threshold)
  );
  const hasNotes = !!(pet.behavioral_notes || pet.special_instructions);

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="bg-cream-50 border-b border-tan-200">
        <ScreenContainer variant="content">
          <View className="flex-row items-center justify-between px-4 pt-12 pb-4">
            <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
            <Button title="Home" onPress={() => navigation.navigate('Home')} variant="outline" />
          </View>

          {/* Pet identity */}
          <View className="items-center pb-6">
            {pet.photo_url ? (
              <Image
                source={{ uri: pet.photo_url }}
                className="w-28 h-28 rounded-full"
                resizeMode="cover"
              />
            ) : (
              <View className="w-28 h-28 rounded-full bg-tan-100 items-center justify-center">
                <Text className="text-5xl">{emoji}</Text>
              </View>
            )}
            <Text className="text-2xl font-bold text-brown-800 mt-4">{pet.name}</Text>
            {pet.nicknames && (
              <Text className="text-tan-400 text-sm">"{pet.nicknames}"</Text>
            )}
            <Text className="text-tan-500 capitalize">
              {pet.breed || pet.species}
              {pet.age != null && ` • ${pet.age} ${pet.age === 1 ? 'year' : 'years'} old`}
            </Text>
            {pet.status === 'deceased' && (
              <View className="bg-tan-100 px-3 py-1 rounded-full mt-2">
                <Text className="text-tan-500 text-sm">In Memorial</Text>
              </View>
            )}
          </View>
        </ScreenContainer>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        <ScreenContainer variant="content">
          {/* Primary action */}
          <View className="mb-4">
            <Button title="Edit Pet" onPress={handleEdit} variant="primary" />
          </View>

          {/* Basics */}
          {hasBasics && (
            <SectionHeader title="Basics" icon="🐾">
              <View className="gap-2">
                {pet.sex && pet.sex !== 'unknown' && (
                  <InfoRow label="Sex" value={pet.sex === 'male' ? 'Male' : 'Female'} />
                )}
                {pet.is_neutered && <InfoRow label="Fixed" value="Spayed/Neutered" />}
                {pet.weight != null && (
                  <InfoRow label="Weight" value={`${pet.weight} ${pet.weight_unit || 'lbs'}`} />
                )}
                {pet.color_markings && <InfoRow label="Color" value={pet.color_markings} />}
                {pet.nicknames && <InfoRow label="Nicknames" value={pet.nicknames} />}
              </View>
            </SectionHeader>
          )}

          {/* Identification */}
          {hasIdentification && (
            <SectionHeader title="Identification" icon="🪪">
              <View className="gap-2">
                {pet.microchip_id && <InfoRow label="Microchip" value={pet.microchip_id} />}
                {pet.license_tag && <InfoRow label="License" value={pet.license_tag} />}
              </View>
            </SectionHeader>
          )}

          {/* Personality */}
          {hasPersonality && personality && (
            <SectionHeader title="Personality" icon="🎾">
              <View className="gap-2">
                {personality.energy_level && (
                  <InfoRow label="Energy" value={titleCase(personality.energy_level)} />
                )}
                {personality.sociability_people && (
                  <InfoRow label="With People" value={titleCase(personality.sociability_people)} />
                )}
                {personality.sociability_pets && (
                  <InfoRow label="With Pets" value={titleCase(personality.sociability_pets)} />
                )}
                {personality.fears && <InfoRow label="Fears" value={personality.fears} />}
                {personality.bad_habits && (
                  <InfoRow label="Bad Habits" value={personality.bad_habits} />
                )}
                {personality.comfort_items && (
                  <InfoRow label="Comforts" value={personality.comfort_items} />
                )}
                {personality.favorite_toys && (
                  <InfoRow label="Toys" value={personality.favorite_toys} />
                )}
                {personality.known_commands && (
                  <InfoRow label="Commands" value={personality.known_commands} />
                )}
              </View>
            </SectionHeader>
          )}

          {/* Feeding Schedule */}
          {pet.feeding_schedule.length > 0 && (
            <SectionHeader title="Feeding Schedule" icon="🍽️">
              {pet.feeding_schedule.map((schedule, index) => (
                <View
                  key={schedule.id}
                  className={`pb-3 ${
                    index < pet.feeding_schedule.length - 1
                      ? 'border-b border-tan-200 mb-3'
                      : ''
                  }`}
                >
                  <View className="flex-row justify-between">
                    <Text className="font-medium text-brown-800">{schedule.time}</Text>
                    <Text className="text-tan-500">{schedule.amount}</Text>
                  </View>
                  <Text className="text-tan-600">{schedule.food_type}</Text>
                  {schedule.notes && (
                    <Text className="text-tan-400 text-sm mt-1">{schedule.notes}</Text>
                  )}
                </View>
              ))}
            </SectionHeader>
          )}

          {/* Medications */}
          {pet.medications.length > 0 && (
            <SectionHeader title="Medications" icon="💊">
              {pet.medications.map((med, index) => (
                <View
                  key={med.id}
                  className={`pb-3 ${
                    index < pet.medications.length - 1
                      ? 'border-b border-tan-200 mb-3'
                      : ''
                  }`}
                >
                  <Text className="font-medium text-brown-800">{med.name}</Text>
                  <Text className="text-tan-600">
                    {med.dosage} - {med.frequency}
                  </Text>
                  {med.times && med.times.filter((t) => t).length > 0 && (
                    <Text className="text-tan-400 text-sm">
                      {med.times.filter((t) => t).length === 1 ? 'Time' : 'Times'}:{' '}
                      {med.times.filter((t) => t).join(', ')}
                    </Text>
                  )}
                  {med.with_food && (
                    <Text className="text-tan-400 text-sm">Give with food</Text>
                  )}
                  {med.notes && (
                    <Text className="text-tan-400 text-sm mt-1">{med.notes}</Text>
                  )}
                </View>
              ))}
            </SectionHeader>
          )}

          {/* Health & Vet */}
          {hasHealthVet && (
            <SectionHeader title="Health & Vet" icon="🏥">
              <View className="gap-2">
                {pet.vet_info && (
                  <>
                    {pet.vet_info.name && <InfoRow label="Vet" value={pet.vet_info.name} />}
                    {pet.vet_info.clinic && (
                      <InfoRow label="Clinic" value={pet.vet_info.clinic} />
                    )}
                    {pet.vet_info.phone && (
                      <PhoneRow label="Phone" phone={pet.vet_info.phone} />
                    )}
                    {pet.vet_info.address && (
                      <InfoRow label="Address" value={pet.vet_info.address} />
                    )}
                    {pet.vet_info.emergency_phone && (
                      <PhoneRow label="Emergency" phone={pet.vet_info.emergency_phone} />
                    )}
                  </>
                )}
                {pet.medical_notes && (
                  <View className={pet.vet_info ? 'mt-2' : ''}>
                    <Text className="text-tan-500">Medical Notes:</Text>
                    <Text className="text-brown-800">{pet.medical_notes}</Text>
                  </View>
                )}
              </View>
            </SectionHeader>
          )}

          {/* Insurance */}
          {pet.insurance && (
            <SectionHeader title="Insurance" icon="🛡️">
              <View className="gap-2">
                {pet.insurance.provider && (
                  <InfoRow label="Provider" value={pet.insurance.provider} />
                )}
                {pet.insurance.policy_number && (
                  <InfoRow label="Policy #" value={pet.insurance.policy_number} />
                )}
                {pet.insurance.claims_phone && (
                  <PhoneRow label="Claims" phone={pet.insurance.claims_phone} />
                )}
                {pet.insurance.coverage_notes && (
                  <View className="mt-2">
                    <Text className="text-tan-500">Coverage:</Text>
                    <Text className="text-brown-800">{pet.insurance.coverage_notes}</Text>
                  </View>
                )}
              </View>
            </SectionHeader>
          )}

          {/* Health Protocol */}
          {hasHealthProtocol && pet.health_protocol && (
            <SectionHeader title="Health Protocol" icon="🚨">
              {enabledSymptoms.length > 0 && (
                <>
                  <View className="bg-warm-50 p-3 rounded-lg mb-3 border border-warm-200">
                    <Text className="text-warm-800 text-sm font-medium">
                      {pet.health_protocol.vet_call_threshold ||
                        'Call the vet if you notice any of these symptoms:'}
                    </Text>
                  </View>
                  {enabledSymptoms.map((symptom, index) => (
                    <View
                      key={symptom.id}
                      className={`py-2 ${
                        index < enabledSymptoms.length - 1 ? 'border-b border-tan-200' : ''
                      }`}
                    >
                      <Text className="text-brown-800 font-medium">{symptom.name}</Text>
                      {symptom.notes && (
                        <Text className="text-tan-500 text-sm mt-1">{symptom.notes}</Text>
                      )}
                    </View>
                  ))}
                </>
              )}
              {enabledSymptoms.length === 0 && pet.health_protocol.vet_call_threshold && (
                <View className="bg-warm-50 p-3 rounded-lg border border-warm-200">
                  <Text className="text-warm-800 text-sm font-medium">
                    {pet.health_protocol.vet_call_threshold}
                  </Text>
                </View>
              )}
              {pet.health_protocol.general_notes && (
                <View className="mt-3 pt-3 border-t border-tan-200">
                  <Text className="text-tan-500 text-sm">Additional Notes:</Text>
                  <Text className="text-brown-800">{pet.health_protocol.general_notes}</Text>
                </View>
              )}
            </SectionHeader>
          )}

          {/* Notes */}
          {hasNotes && (
            <SectionHeader title="Notes" icon="📝">
              <View className="gap-2">
                {pet.behavioral_notes && (
                  <View>
                    <Text className="text-tan-500">Behavioral Notes:</Text>
                    <Text className="text-brown-800">{pet.behavioral_notes}</Text>
                  </View>
                )}
                {pet.special_instructions && (
                  <View className={pet.behavioral_notes ? 'mt-2' : ''}>
                    <Text className="text-tan-500">Special Instructions:</Text>
                    <Text className="text-brown-800">{pet.special_instructions}</Text>
                  </View>
                )}
              </View>
            </SectionHeader>
          )}

          {/* Quiet secondary actions at the bottom */}
          <View className="gap-3 mt-2 mb-8">
            {pet.status === 'active' ? (
              <Button
                title="Move to Memorial"
                onPress={handleMemorial}
                variant="outline"
              />
            ) : (
              <Button
                title="Restore from Memorial"
                onPress={handleRestore}
                variant="secondary"
              />
            )}
            <Button title="Delete Pet" onPress={handleDelete} variant="outline" />
          </View>
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
