import { View, Text, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, PetCard } from '../components';
import { useData } from '../contexts';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainTabParamList, 'Pets'>;

export function PetListScreen({ navigation }: Props) {
  const { activePets, loadingPets } = useData();

  const handleAddPet = () => {
    (navigation as any).navigate('PetForm', { mode: 'create' });
  };

  const handlePetPress = (petId: string) => {
    (navigation as any).navigate('PetDetail', { petId });
  };

  if (loadingPets) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-white border-b border-gray-100">
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-2xl font-bold text-gray-900">My Pets</Text>
            <Text className="text-gray-500">
              {activePets.length} {activePets.length === 1 ? 'pet' : 'pets'}
            </Text>
          </View>
          {Platform.OS === 'web' ? (
            <button
              onClick={handleAddPet}
              style={{
                padding: '10px 20px',
                backgroundColor: '#2563eb',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Add Pet
            </button>
          ) : (
            <Button
              title="+ Add Pet"
              onPress={handleAddPet}
              variant="primary"
            />
          )}
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
        {activePets.length === 0 ? (
          <View className="items-center justify-center py-16">
            <Text className="text-6xl mb-4">🐾</Text>
            <Text className="text-xl font-semibold text-gray-900 mb-2">
              No pets yet
            </Text>
            <Text className="text-gray-500 text-center mb-6">
              Add your first pet to get started creating care guides.
            </Text>
            <Button
              title="Add Your First Pet"
              onPress={handleAddPet}
              variant="primary"
            />
          </View>
        ) : (
          activePets.map((pet) => (
            <PetCard
              key={pet.id}
              pet={pet}
              onPress={() => handlePetPress(pet.id)}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}
