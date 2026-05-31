import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, PetCard } from '../components';
import { useData } from '../contexts';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'Pets'>;

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
      <View className="flex-1 items-center justify-center bg-cream-200">
        <ActivityIndicator size="large" color={COLORS.secondary} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
        <Pressable
          onPress={() => navigation.navigate('Home')}
          className="mb-3"
          accessibilityRole="button"
          accessibilityLabel="Back to home"
        >
          <Text className="text-tan-500 text-sm">← Back to Home</Text>
        </Pressable>
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-2xl font-bold text-brown-800">My Pets</Text>
            <Text className="text-tan-500">
              {activePets.length} {activePets.length === 1 ? 'pet' : 'pets'}
            </Text>
          </View>
          <Button
            title="+ Add Pet"
            onPress={handleAddPet}
            variant="primary"
          />
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
        {activePets.length === 0 ? (
          <View className="items-center justify-center py-16">
            <Text className="text-6xl mb-4">🐾</Text>
            <Text className="text-xl font-semibold text-brown-800 mb-2">
              No pets yet
            </Text>
            <Text className="text-tan-500 text-center mb-6">
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
