import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, ScrollView, Text, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, ScreenContainer } from '../components';
import { useData } from '../contexts';
import { CheckinFeed } from '../components/CheckinFeed';
import { formatDate } from '../lib/dates';
import { speciesIconName } from '../components';
import { Icon } from '../components/Icon';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { Guide, Pet } from '../types';

type Props = NativeStackScreenProps<MainStackParamList, 'SitterHousehold'>;

export function SitterHouseholdScreen({ navigation, route }: Props) {
  const { householdId, householdName } = route.params;
  
  const { getHouseholdPets, getHouseholdGuides } = useData();

  useFocusEffect(
    useCallback(() => {
      void loadHousehold();
    }, [])
  );

  // Fetched for THIS household rather than filtered out of the caller's own
  // lists. getPets/getGuides are scoped to households the user is a member of —
  // which a sitter is not — so filtering them here would always yield nothing.
  const [householdPets, setHouseholdPets] = useState<Pet[]>([]);
  const [householdGuides, setHouseholdGuides] = useState<Guide[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingHousehold, setLoadingHousehold] = useState(true);

  const loadHousehold = useCallback(async () => {
    setLoadingHousehold(true);
    try {
      const [p, g] = await Promise.all([
        getHouseholdPets(householdId),
        getHouseholdGuides(householdId),
      ]);
      setHouseholdPets(p);
      setHouseholdGuides(g);
      setLoadError(null);
    } catch (err) {
      // Never fall through to the empty state: a sitter who cannot load their
      // client must not be told the client has no pets.
      setLoadError((err as Error)?.message || 'Could not load this household.');
    } finally {
      setLoadingHousehold(false);
    }
  }, [householdId, getHouseholdPets, getHouseholdGuides]);

  useFocusEffect(
    useCallback(() => {
      void loadHousehold();
    }, [loadHousehold])
  );

  if (loadingHousehold && householdGuides.length === 0) {
    return (
      <View className="flex-1 bg-cream-200 items-center justify-center">
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#8B4513" />
      </View>
    );
  }

  if (loadError) {
    return (
      <View className="flex-1 bg-cream-200">
        <StatusBar style="dark" />
        <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
          <ScreenContainer variant="content">
            <View className="flex-row items-center justify-between">
              <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
            </View>
            <View className="mt-4">
              <Text className="text-2xl font-bold text-brown-800">{householdName}</Text>
              <Text className="text-tan-500">You help care for these pets</Text>
            </View>
          </ScreenContainer>
        </View>
        <ScrollView className="flex-1">
          <ScreenContainer variant="content">
            <Card className="bg-warm-50 border border-warm-300 p-4">
              <Text className="text-brown-800 mb-2">{loadError}</Text>
              <Button 
                title="Try Again" 
                onPress={() => void loadHousehold()} 
                variant="primary" 
              />
            </Card>

          </ScreenContainer>
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />
      <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
        <ScreenContainer variant="content">
          <View className="flex-row items-center justify-between">
            <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
          </View>
          <View className="mt-4">
            <Text className="text-2xl font-bold text-brown-800">{householdName}</Text>
            <Text className="text-tan-500">You help care for these pets</Text>
          </View>
        </ScreenContainer>
      </View>
      <ScrollView className="flex-1">
        <ScreenContainer variant="content">
          <Card className="mb-6 bg-warm-50 border border-warm-300 p-4">
            <Text className="text-lg font-bold text-brown-800 mb-3">Pets</Text>
            {householdPets.length === 0 ? (
              <Text className="text-tan-500">No pets in this household</Text>
            ) : (
              <View className="space-y-2">
                {householdPets.map(pet => (
                  <View key={pet.id} className="flex-row items-center p-2">
                    <Icon name={speciesIconName(pet.species)} size={32} />
                    <Text className="ml-3 text-brown-800">{pet.name}</Text>
                  </View>
                ))}
              </View>
            )}
          </Card>

          <Card className="bg-warm-50 border border-warm-300 p-4">
            <Text className="text-lg font-bold text-brown-800 mb-3">Care Guides</Text>
            {householdGuides.length === 0 ? (
              <Text className="text-tan-500">The owner has not shared a care guide yet. It will appear here when they do.</Text>
            ) : (
              <View className="space-y-2">
                {householdGuides.map(guide => (
                  <Card 
                    key={guide.id} 
                    className="p-3 border border-tan-200 bg-white"
                    onPress={() => navigation.navigate('GuideDetail', { guideId: guide.id })}
                  >
                    <Text className="font-medium text-brown-800">{guide.title}</Text>
                    {guide.start_date && guide.end_date && (
                      <Text className="text-sm text-tan-500 mt-1">
                        {formatDate(guide.start_date)} – {formatDate(guide.end_date)}
                      </Text>
                    )}
                  </Card>
                ))}
              </View>
            )}
          </Card>
          {/* The point of the sitter account for the OWNER: ticking a task is
              invisible, a note is not. On the HAPPY path — an earlier edit put
              this inside the guidesError early-return, so a sitter could only
              post a check-in when loading the guides had failed. */}
          <CheckinFeed householdId={householdId} canPost />

        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
