import { View, Text, ScrollView, Platform, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, PetCard, Card } from '../components';
import { useData } from '../contexts';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainTabParamList, 'Memorial'>;

export function MemorialScreen({ navigation }: Props) {
  const { deceasedPets, restorePet, deletePet } = useData();

  const handleRestore = async (petId: string, petName: string) => {
    const performRestore = async () => {
      await restorePet(petId);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Restore ${petName} to active pets?`)) {
        performRestore();
      }
    } else {
      Alert.alert(
        'Restore Pet',
        `Restore ${petName} to active pets?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Restore', onPress: performRestore },
        ]
      );
    }
  };

  const handleDelete = async (petId: string, petName: string) => {
    const performDelete = async () => {
      await deletePet(petId);
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`Permanently delete ${petName}? This cannot be undone.`)) {
        performDelete();
      }
    } else {
      Alert.alert(
        'Delete Pet',
        `Permanently delete ${petName}? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: performDelete },
        ]
      );
    }
  };

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
        <View className="flex-row items-center">
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
        </View>
        <View className="mt-4">
          <Text className="text-2xl font-bold text-brown-800">Pet Memorial</Text>
          <Text className="text-tan-500">
            Remembering our beloved companions
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
        {deceasedPets.length === 0 ? (
          <Card className="items-center py-8">
            <Text className="text-5xl mb-4">🌈</Text>
            <Text className="text-xl font-semibold text-brown-800 mb-2">
              No pets in memorial
            </Text>
            <Text className="text-tan-500 text-center">
              Pets moved to memorial will appear here.
            </Text>
          </Card>
        ) : (
          deceasedPets.map((pet) => (
            <View key={pet.id} className="mb-4">
              <Card>
                <View className="flex-row items-center mb-4">
                  <View className="w-16 h-16 rounded-full bg-tan-100 items-center justify-center mr-4">
                    <Text className="text-3xl">
                      {pet.species === 'dog' ? '🐕' : pet.species === 'cat' ? '🐱' : '🐾'}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-lg font-semibold text-brown-800">
                      {pet.name}
                    </Text>
                    <Text className="text-tan-500 capitalize">
                      {pet.breed || pet.species}
                    </Text>
                    {pet.deceased_date && (
                      <Text className="text-tan-400 text-sm">
                        🕊️ {new Date(pet.deceased_date).toLocaleDateString()}
                      </Text>
                    )}
                  </View>
                </View>

                <View className="flex-row gap-2">
                  <View className="flex-1">
                    <Button
                      title="Restore"
                      onPress={() => handleRestore(pet.id, pet.name)}
                      variant="outline"
                    />
                  </View>
                  <View className="flex-1">
                    <Button
                      title="Delete"
                      onPress={() => handleDelete(pet.id, pet.name)}
                      variant="secondary"
                    />
                  </View>
                </View>
              </Card>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
