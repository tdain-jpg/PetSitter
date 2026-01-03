import { useState, useEffect } from 'react';
import { View, Text, ScrollView, Image, Alert, ActivityIndicator, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card } from '../components';
import { useData } from '../contexts';
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
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!pet) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <Text className="text-xl text-gray-500">Pet not found</Text>
        <Button title="Go Back" onPress={() => navigation.goBack()} variant="outline" />
      </View>
    );
  }

  const emoji = speciesEmoji[pet.species] || '🐾';

  return (
    <View className="flex-1 bg-gray-50">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="bg-white border-b border-gray-100">
        <View className="flex-row items-center px-4 pt-12 pb-4">
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
              ← Back
            </button>
          ) : (
            <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
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
            <View className="w-28 h-28 rounded-full bg-gray-100 items-center justify-center">
              <Text className="text-5xl">{emoji}</Text>
            </View>
          )}
          <Text className="text-2xl font-bold text-gray-900 mt-4">{pet.name}</Text>
          <Text className="text-gray-500 capitalize">
            {pet.breed || pet.species}
            {pet.age && ` • ${pet.age} ${pet.age === 1 ? 'year' : 'years'} old`}
          </Text>
          {pet.status === 'deceased' && (
            <View className="bg-gray-100 px-3 py-1 rounded-full mt-2">
              <Text className="text-gray-500 text-sm">In Memorial</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
        {/* Basic Info */}
        {(pet.weight || pet.vet_info) && (
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-gray-900 mb-3">Basic Info</Text>
            {pet.weight && (
              <View className="flex-row mb-2">
                <Text className="text-gray-500 w-24">Weight:</Text>
                <Text className="text-gray-900">
                  {pet.weight} {pet.weight_unit || 'lbs'}
                </Text>
              </View>
            )}
            {pet.vet_info && (
              <>
                <View className="flex-row mb-2">
                  <Text className="text-gray-500 w-24">Vet:</Text>
                  <Text className="text-gray-900">{pet.vet_info.name}</Text>
                </View>
                <View className="flex-row mb-2">
                  <Text className="text-gray-500 w-24">Clinic:</Text>
                  <Text className="text-gray-900">{pet.vet_info.clinic}</Text>
                </View>
                <View className="flex-row">
                  <Text className="text-gray-500 w-24">Phone:</Text>
                  <Text className="text-primary-600">{pet.vet_info.phone}</Text>
                </View>
              </>
            )}
          </Card>
        )}

        {/* Feeding Schedule */}
        {pet.feeding_schedule.length > 0 && (
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-gray-900 mb-3">
              Feeding Schedule
            </Text>
            {pet.feeding_schedule.map((schedule, index) => (
              <View
                key={schedule.id}
                className={`pb-3 ${
                  index < pet.feeding_schedule.length - 1
                    ? 'border-b border-gray-100 mb-3'
                    : ''
                }`}
              >
                <View className="flex-row justify-between">
                  <Text className="font-medium text-gray-900">{schedule.time}</Text>
                  <Text className="text-gray-500">{schedule.amount}</Text>
                </View>
                <Text className="text-gray-600">{schedule.food_type}</Text>
                {schedule.notes && (
                  <Text className="text-gray-400 text-sm mt-1">{schedule.notes}</Text>
                )}
              </View>
            ))}
          </Card>
        )}

        {/* Medications */}
        {pet.medications.length > 0 && (
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-gray-900 mb-3">
              Medications
            </Text>
            {pet.medications.map((med, index) => (
              <View
                key={med.id}
                className={`pb-3 ${
                  index < pet.medications.length - 1
                    ? 'border-b border-gray-100 mb-3'
                    : ''
                }`}
              >
                <Text className="font-medium text-gray-900">{med.name}</Text>
                <Text className="text-gray-600">
                  {med.dosage} - {med.frequency}
                </Text>
                {med.time && (
                  <Text className="text-gray-400 text-sm">Time: {med.time}</Text>
                )}
                {med.with_food && (
                  <Text className="text-gray-400 text-sm">Give with food</Text>
                )}
                {med.notes && (
                  <Text className="text-gray-400 text-sm mt-1">{med.notes}</Text>
                )}
              </View>
            ))}
          </Card>
        )}

        {/* Medical Notes */}
        {pet.medical_notes && (
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-gray-900 mb-2">
              Medical Notes
            </Text>
            <Text className="text-gray-600">{pet.medical_notes}</Text>
          </Card>
        )}

        {/* Behavioral Notes */}
        {pet.behavioral_notes && (
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-gray-900 mb-2">
              Behavioral Notes
            </Text>
            <Text className="text-gray-600">{pet.behavioral_notes}</Text>
          </Card>
        )}

        {/* Special Instructions */}
        {pet.special_instructions && (
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-gray-900 mb-2">
              Special Instructions
            </Text>
            <Text className="text-gray-600">{pet.special_instructions}</Text>
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
