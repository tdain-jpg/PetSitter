import { useEffect } from 'react';
import { View, Text, ScrollView, Image } from 'react-native';
import { showAlert } from '../lib/showAlert';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, PetCard } from '../components';
import { COLORS } from '../constants';

// @ts-ignore
const logo = require('../../assets/logo.png');
import { useAuth, useData } from '../contexts';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const { user, signOut } = useAuth();
  const { activePets, guides, loadingPets, loadingGuides, settings, loadingSettings } = useData();

  // Check if onboarding is needed
  useEffect(() => {
    if (!loadingSettings && settings && !settings.onboarding_completed) {
      navigation.replace('Onboarding');
    }
  }, [loadingSettings, settings, navigation]);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to sign out');
    }
  };

  const navigateToPets = () => {
    navigation.navigate('Pets');
  };

  const navigateToGuides = () => {
    navigation.navigate('Guides');
  };

  const navigateToSettings = () => {
    navigation.navigate('Settings');
  };

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
        <View className="flex-row justify-between items-center">
          <View className="flex-row items-center">
            <Image
              source={logo}
              style={{ width: 108, height: 108, marginRight: 12 }}
              resizeMode="contain"
            />
            <View>
              <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.brown, letterSpacing: 0.5 }}>
                Pawstructions
              </Text>
              <Text style={{ fontSize: 12, color: COLORS.primary, fontStyle: 'italic' }}>
                Where Pets Rule the Kingdom!
              </Text>
            </View>
          </View>
          <View className="items-end">
            <Button
              title="Settings"
              onPress={navigateToSettings}
              variant="secondary"
            />
            <Text style={{ fontSize: 12, color: COLORS.tan, marginTop: 4 }}>
              Welcome{user?.email ? `, ${user.email.split('@')[0]}` : ''}!
            </Text>
          </View>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        {/* Quick Stats */}
        <View className="flex-row gap-4 mb-6">
          <Card className="flex-1">
            <Text className="text-3xl font-bold text-primary-500">
              {loadingPets ? '...' : activePets.length}
            </Text>
            <Text className="text-tan-500">Pets</Text>
          </Card>
          <Card className="flex-1">
            <Text className="text-3xl font-bold text-primary-500">
              {loadingGuides ? '...' : guides.length}
            </Text>
            <Text className="text-tan-500">Guides</Text>
          </Card>
        </View>

        {/* Quick Actions */}
        <Card className="mb-6">
          <Text className="text-lg font-semibold text-brown-800 mb-4">
            Quick Actions
          </Text>
          <View className="gap-3">
            {activePets.length > 0 && (
              <Button
                title="✈️ Quick Trip Setup"
                onPress={() => navigation.navigate('TripWizard')}
                variant="primary"
              />
            )}
            <Button
              title="Manage Pets"
              onPress={navigateToPets}
              variant={activePets.length > 0 ? 'outline' : 'primary'}
            />
            <Button
              title="View Guides"
              onPress={navigateToGuides}
              variant="outline"
            />
          </View>
        </Card>

        {/* Recent Pets */}
        {activePets.length > 0 && (
          <View className="mb-6">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-lg font-semibold text-brown-800">
                Your Pets
              </Text>
              <Button
                title="See All →"
                onPress={navigateToPets}
                variant="outline"
              />
            </View>
            {activePets.slice(0, 3).map((pet) => (
              <PetCard
                key={pet.id}
                pet={pet}
                onPress={() => navigation.navigate('PetDetail', { petId: pet.id })}
              />
            ))}
          </View>
        )}

        {/* Empty State */}
        {activePets.length === 0 && !loadingPets && (
          <Card className="mb-6">
            <View className="items-center py-8">
              <Text className="text-5xl mb-4">🐾</Text>
              <Text className="text-xl font-semibold text-brown-800 mb-2">
                Get Started
              </Text>
              <Text className="text-tan-500 text-center mb-4">
                Add your first pet to start creating care guides for your pet sitters.
              </Text>
              <Button
                title="Add Your First Pet"
                onPress={() => navigation.navigate('PetForm', { mode: 'create' })}
                variant="primary"
              />
            </View>
          </Card>
        )}

        {/* Sign Out */}
        <View className="mt-4">
          <Button
            title="Sign Out"
            onPress={handleSignOut}
            variant="secondary"
          />
        </View>
      </ScrollView>
    </View>
  );
}
