import { useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, ScrollView, Text, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, ScreenContainer } from '../components';
import { useData } from '../contexts';
import { formatDate } from '../lib/dates';
import { speciesIconName } from '../components';
import { Icon } from '../components/Icon';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { Guide, Pet } from '../types';

type Props = NativeStackScreenProps<MainStackParamList, 'SitterHousehold'>;

export function SitterHouseholdScreen({ navigation, route }: Props) {
  const { householdId, householdName } = route.params;
  
  const {
    guides,
    activePets,
    loadingGuides,
    guidesError,
    refreshGuides
  } = useData();

  useFocusEffect(
    useCallback(() => {
      refreshGuides();
    }, [])
  );

  const householdPets = activePets.filter(pet => pet.household_id === householdId);
  const householdGuides = guides.filter(guide => guide.household_id === householdId);

  if (loadingGuides && householdGuides.length === 0) {
    return (
      <View className="flex-1 bg-cream-200 items-center justify-center">
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#8B4513" />
      </View>
    );
  }

  if (guidesError) {
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
              <Text className="text-brown-800 mb-2">{guidesError}</Text>
              <Button 
                title="Try Again" 
                onPress={refreshGuides} 
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
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
