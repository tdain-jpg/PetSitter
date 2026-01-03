import { useEffect } from 'react';
import { View, Text, ScrollView, Alert, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, PetCard } from '../components';
import { useAuth, useData } from '../contexts';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainTabParamList, 'Home'>;

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
      Alert.alert('Error', error.message || 'Failed to sign out');
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
    <View className="flex-1 bg-gray-50">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-white border-b border-gray-100">
        <View className="flex-row justify-between items-center">
          <View>
            <Text className="text-2xl font-bold text-gray-900">
              Pet Sitter Guide
            </Text>
            <Text className="text-gray-500">
              Welcome{user?.email ? `, ${user.email.split('@')[0]}` : ''}!
            </Text>
          </View>
          {Platform.OS === 'web' ? (
            <button
              onClick={navigateToSettings}
              style={{
                padding: '8px 16px',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              Settings
            </button>
          ) : (
            <Button
              title="Settings"
              onPress={navigateToSettings}
              variant="secondary"
            />
          )}
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        {/* Quick Stats */}
        <View className="flex-row gap-4 mb-6">
          <Card className="flex-1">
            <Text className="text-3xl font-bold text-primary-600">
              {loadingPets ? '...' : activePets.length}
            </Text>
            <Text className="text-gray-500">Pets</Text>
          </Card>
          <Card className="flex-1">
            <Text className="text-3xl font-bold text-primary-600">
              {loadingGuides ? '...' : guides.length}
            </Text>
            <Text className="text-gray-500">Guides</Text>
          </Card>
        </View>

        {/* Quick Actions */}
        <Card className="mb-6">
          <Text className="text-lg font-semibold text-gray-900 mb-4">
            Quick Actions
          </Text>
          <View className="gap-3">
            <Button
              title="Manage Pets"
              onPress={navigateToPets}
              variant="primary"
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
              <Text className="text-lg font-semibold text-gray-900">
                Your Pets
              </Text>
              {Platform.OS === 'web' ? (
                <button
                  onClick={navigateToPets}
                  style={{
                    padding: '4px 12px',
                    backgroundColor: 'transparent',
                    color: '#2563eb',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 14,
                  }}
                >
                  See All →
                </button>
              ) : (
                <Button
                  title="See All →"
                  onPress={navigateToPets}
                  variant="outline"
                />
              )}
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
              <Text className="text-xl font-semibold text-gray-900 mb-2">
                Get Started
              </Text>
              <Text className="text-gray-500 text-center mb-4">
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
