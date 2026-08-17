import { View, Text, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { showAlert } from '../lib/showAlert';
import { showConfirm } from '../lib/dialogs';
import { formatDate } from '../lib/dates';
import { Button, Card, Icon, ScreenContainer, speciesIconName } from '../components';
import { useData } from '../contexts';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import { friendlyError } from '../lib/errors';

type Props = NativeStackScreenProps<MainStackParamList, 'Memorial'>;

export function MemorialScreen({ navigation }: Props) {
  const { deceasedPets, restorePet, deletePet } = useData();

  const handleRestore = async (petId: string, petName: string) => {
    const confirmed = await showConfirm({
      title: 'Restore Pet',
      message: `Restore ${petName} to active pets?`,
      confirmLabel: 'Restore',
    });
    if (!confirmed) return;

    try {
      await restorePet(petId);
    } catch (error: any) {
      showAlert('Error', friendlyError(error, `Failed to restore ${petName}`));
    }
  };

  const handleDelete = async (petId: string, petName: string) => {
    const confirmed = await showConfirm({
      title: 'Delete Pet',
      message: `Permanently delete ${petName}? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await deletePet(petId);
    } catch (error: any) {
      showAlert('Error', friendlyError(error, `Failed to delete ${petName}`));
    }
  };

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
        <ScreenContainer variant="content">
          <View className="flex-row items-center">
            <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
          </View>
          <View className="mt-4">
            <Text className="text-2xl font-bold text-brown-800">Pet Memorial</Text>
            <Text className="text-tan-500">
              Remembering our beloved companions
            </Text>
          </View>
        </ScreenContainer>
      </View>

      <ScrollView className="flex-1 p-4">
        <ScreenContainer variant="content">
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
                  {/* Same circle and same size as PetCard's photo fallback, so
                      a pet looks like itself on both screens (this used to be
                      a three-branch emoji ladder — every rabbit was a paw). */}
                  <View className="w-16 h-16 rounded-full bg-tan-100 items-center justify-center mr-4">
                    <Icon name={speciesIconName(pet.species)} size={40} />
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
                        {/* parseLocalDate, NOT new Date(): the bare string
                            constructor parses 'YYYY-MM-DD' as UTC midnight, so
                            every user west of UTC saw the day BEFORE the one
                            PetDetail wrote with todayLocal(). On a memorial
                            screen a date that is silently wrong by a day reads
                            as corruption, not as a rounding artefact. */}
                        🕊️ {formatDate(pet.deceased_date, { dateStyle: 'medium' })}
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
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
