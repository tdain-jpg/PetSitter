import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Image, Alert, ActivityIndicator, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card } from '../components';
import { useData } from '../contexts';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '../navigation/types';
import type { Pet } from '../types';

type Props = NativeStackScreenProps<MainTabParamList, 'PetDetail'>;

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

export function PetDetailScreen({ navigation, route }: Props) {
  const { petId } = route.params;
  const { activePets, deceasedPets, deletePet, markPetDeceased, restorePet } = useData();

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

  const handleDelete = () => {
    const confirmDelete = () => {
      deletePet(petId);
      navigation.goBack();
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Are you sure you want to delete ${pet?.name}? This cannot be undone.`)) {
        confirmDelete();
      }
    } else {
      Alert.alert(
        'Delete Pet',
        `Are you sure you want to delete ${pet?.name}? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: confirmDelete },
        ]
      );
    }
  };

  const handleMemorial = () => {
    const today = new Date().toISOString().split('T')[0];
    markPetDeceased(petId, today);
  };

  const handleRestore = () => {
    restorePet(petId);
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-200">
        <ActivityIndicator size="large" color={COLORS.secondary} />
      </View>
    );
  }

  if (!pet) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-200">
        <Text className="text-xl text-tan-500">Pet not found</Text>
        <Button title="Go Back" onPress={() => navigation.goBack()} variant="outline" />
      </View>
    );
  }

  const emoji = speciesEmoji[pet.species] || '🐾';

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="bg-cream-50 border-b border-tan-200">
        <View className="flex-row items-center justify-between px-4 pt-12 pb-4">
          {Platform.OS === 'web' ? (
            <button
              onClick={() => navigation.goBack()}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                color: COLORS.secondary,
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
              }}
            >
              ← Back
            </button>
          ) : (
            <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
          )}
          {Platform.OS === 'web' ? (
            <button
              onClick={() => navigation.navigate('Home')}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                color: COLORS.tan,
                border: 'none',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Home
            </button>
          ) : (
            <Button title="Home" onPress={() => navigation.navigate('Home')} variant="outline" />
          )}
        </View>

        {/* Pet Header */}
        <View className="items-center pb-6">
          {pet.photo_url ? (
            Platform.OS === 'web' ? (
              <img
                src={pet.photo_url}
                alt={pet.name}
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 60,
                  objectFit: 'cover',
                }}
              />
            ) : (
              <Image
                source={{ uri: pet.photo_url }}
                className="w-28 h-28 rounded-full"
                resizeMode="cover"
              />
            )
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
            {pet.sex && pet.sex !== 'unknown' && ` • ${pet.sex === 'male' ? 'Male' : 'Female'}`}
            {pet.is_neutered && ' (Fixed)'}
            {pet.age && ` • ${pet.age} ${pet.age === 1 ? 'year' : 'years'} old`}
          </Text>
          {pet.status === 'deceased' && (
            <View className="bg-tan-100 px-3 py-1 rounded-full mt-2">
              <Text className="text-tan-500 text-sm">In Memorial</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
        {/* Basic Info */}
        {(pet.weight || pet.color_markings || pet.vet_info) && (
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-brown-800 mb-3">Basic Info</Text>
            {pet.weight && (
              <View className="flex-row mb-2">
                <Text className="text-tan-500 w-24">Weight:</Text>
                <Text className="text-brown-800">
                  {pet.weight} {pet.weight_unit || 'lbs'}
                </Text>
              </View>
            )}
            {pet.color_markings && (
              <View className="flex-row mb-2">
                <Text className="text-tan-500 w-24">Color:</Text>
                <Text className="text-brown-800">{pet.color_markings}</Text>
              </View>
            )}
            {pet.vet_info && (
              <>
                <View className="flex-row mb-2">
                  <Text className="text-tan-500 w-24">Vet:</Text>
                  <Text className="text-brown-800">{pet.vet_info.name}</Text>
                </View>
                <View className="flex-row mb-2">
                  <Text className="text-tan-500 w-24">Clinic:</Text>
                  <Text className="text-brown-800">{pet.vet_info.clinic}</Text>
                </View>
                <View className="flex-row">
                  <Text className="text-tan-500 w-24">Phone:</Text>
                  <Text className="text-primary-600">{pet.vet_info.phone}</Text>
                </View>
              </>
            )}
          </Card>
        )}

        {/* Identification */}
        {(pet.microchip_id || pet.license_tag) && (
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-brown-800 mb-3">Identification</Text>
            {pet.microchip_id && (
              <View className="flex-row mb-2">
                <Text className="text-tan-500 w-24">Microchip:</Text>
                <Text className="text-brown-800">{pet.microchip_id}</Text>
              </View>
            )}
            {pet.license_tag && (
              <View className="flex-row">
                <Text className="text-tan-500 w-24">License:</Text>
                <Text className="text-brown-800">{pet.license_tag}</Text>
              </View>
            )}
          </Card>
        )}

        {/* Personality */}
        {pet.personality && (
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-brown-800 mb-3">Personality</Text>
            {pet.personality.energy_level && (
              <View className="flex-row mb-2">
                <Text className="text-tan-500 w-28">Energy:</Text>
                <Text className="text-brown-800 capitalize">{pet.personality.energy_level.replace('_', ' ')}</Text>
              </View>
            )}
            {pet.personality.sociability_people && (
              <View className="flex-row mb-2">
                <Text className="text-tan-500 w-28">With People:</Text>
                <Text className="text-brown-800 capitalize">{pet.personality.sociability_people.replace('_', ' ')}</Text>
              </View>
            )}
            {pet.personality.sociability_pets && (
              <View className="flex-row mb-2">
                <Text className="text-tan-500 w-28">With Pets:</Text>
                <Text className="text-brown-800 capitalize">{pet.personality.sociability_pets.replace('_', ' ')}</Text>
              </View>
            )}
            {pet.personality.fears && (
              <View className="mb-2">
                <Text className="text-tan-500">Fears:</Text>
                <Text className="text-brown-800">{pet.personality.fears}</Text>
              </View>
            )}
            {pet.personality.bad_habits && (
              <View className="mb-2">
                <Text className="text-tan-500">Bad Habits:</Text>
                <Text className="text-brown-800">{pet.personality.bad_habits}</Text>
              </View>
            )}
            {pet.personality.comfort_items && (
              <View className="mb-2">
                <Text className="text-tan-500">Comfort Items:</Text>
                <Text className="text-brown-800">{pet.personality.comfort_items}</Text>
              </View>
            )}
            {pet.personality.favorite_toys && (
              <View className="mb-2">
                <Text className="text-tan-500">Favorite Toys:</Text>
                <Text className="text-brown-800">{pet.personality.favorite_toys}</Text>
              </View>
            )}
            {pet.personality.known_commands && (
              <View>
                <Text className="text-tan-500">Known Commands:</Text>
                <Text className="text-brown-800">{pet.personality.known_commands}</Text>
              </View>
            )}
          </Card>
        )}

        {/* Feeding Schedule */}
        {pet.feeding_schedule.length > 0 && (
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-brown-800 mb-3">
              Feeding Schedule
            </Text>
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
          </Card>
        )}

        {/* Medications */}
        {pet.medications.length > 0 && (
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-brown-800 mb-3">
              Medications
            </Text>
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
                {med.times && med.times.filter(t => t).length > 0 && (
                  <Text className="text-tan-400 text-sm">
                    {med.times.filter(t => t).length === 1 ? 'Time' : 'Times'}: {med.times.filter(t => t).join(', ')}
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
          </Card>
        )}

        {/* Insurance */}
        {pet.insurance && (
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-brown-800 mb-3">
              Pet Insurance
            </Text>
            <View className="flex-row mb-2">
              <Text className="text-tan-500 w-24">Provider:</Text>
              <Text className="text-brown-800">{pet.insurance.provider}</Text>
            </View>
            <View className="flex-row mb-2">
              <Text className="text-tan-500 w-24">Policy #:</Text>
              <Text className="text-brown-800">{pet.insurance.policy_number}</Text>
            </View>
            {pet.insurance.claims_phone && (
              <View className="flex-row mb-2">
                <Text className="text-tan-500 w-24">Claims:</Text>
                <Text className="text-primary-600">{pet.insurance.claims_phone}</Text>
              </View>
            )}
            {pet.insurance.coverage_notes && (
              <View>
                <Text className="text-tan-500">Coverage:</Text>
                <Text className="text-tan-600">{pet.insurance.coverage_notes}</Text>
              </View>
            )}
          </Card>
        )}

        {/* Health Alerts / Symptom Checker */}
        {pet.health_protocol && pet.health_protocol.symptoms.some(s => s.is_enabled) && (
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-brown-800 mb-3">
              Health Alerts
            </Text>
            <View className="bg-amber-50 p-3 rounded-lg mb-3 border border-amber-200">
              <Text className="text-amber-800 text-sm font-medium">
                Call the vet if you notice any of these symptoms:
              </Text>
            </View>
            {pet.health_protocol.symptoms
              .filter(s => s.is_enabled)
              .map((symptom, index) => (
                <View
                  key={symptom.id}
                  className={`py-2 ${
                    index < pet.health_protocol!.symptoms.filter(s => s.is_enabled).length - 1
                      ? 'border-b border-tan-200'
                      : ''
                  }`}
                >
                  <Text className="text-brown-800 font-medium">{symptom.name}</Text>
                  {symptom.notes && (
                    <Text className="text-tan-500 text-sm mt-1">{symptom.notes}</Text>
                  )}
                </View>
              ))}
            {pet.health_protocol.general_notes && (
              <View className="mt-3 pt-3 border-t border-tan-200">
                <Text className="text-tan-500 text-sm">Additional Notes:</Text>
                <Text className="text-brown-600">{pet.health_protocol.general_notes}</Text>
              </View>
            )}
          </Card>
        )}

        {/* Medical Notes */}
        {pet.medical_notes && (
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-brown-800 mb-2">
              Medical Notes
            </Text>
            <Text className="text-tan-600">{pet.medical_notes}</Text>
          </Card>
        )}

        {/* Behavioral Notes */}
        {pet.behavioral_notes && (
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-brown-800 mb-2">
              Behavioral Notes
            </Text>
            <Text className="text-tan-600">{pet.behavioral_notes}</Text>
          </Card>
        )}

        {/* Special Instructions */}
        {pet.special_instructions && (
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-brown-800 mb-2">
              Special Instructions
            </Text>
            <Text className="text-tan-600">{pet.special_instructions}</Text>
          </Card>
        )}

        {/* Action Buttons */}
        <View className="gap-3 mb-8">
          <Button title="Edit Pet" onPress={handleEdit} variant="primary" />
          {pet.status === 'active' ? (
            <Button
              title="Move to Memorial"
              onPress={handleMemorial}
              variant="secondary"
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
      </ScrollView>
    </View>
  );
}
