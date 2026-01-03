import { View, Text, ScrollView, Platform, Dimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card } from '../components';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<AuthStackParamList, 'Landing'>;

const features = [
  {
    icon: '🐾',
    title: 'Pet Profiles',
    description: 'Store all your pet information in one place - feeding schedules, medications, vet info, and more.',
  },
  {
    icon: '📋',
    title: 'Care Guides',
    description: 'Create comprehensive guides with home info, emergency contacts, and daily routines.',
  },
  {
    icon: '✅',
    title: 'Daily Checklists',
    description: 'Generate interactive checklists organized by time of day for your pet sitter.',
  },
  {
    icon: '📄',
    title: 'PDF Export',
    description: 'Export your guides as professional PDFs to print or share digitally.',
  },
  {
    icon: '🔗',
    title: 'Easy Sharing',
    description: 'Share read-only links with your pet sitter - no account required for them to view.',
  },
];

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <Card className="mb-4">
      <View className="flex-row items-start">
        <View className="w-12 h-12 bg-blue-100 rounded-xl items-center justify-center mr-4">
          <Text className="text-2xl">{icon}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-lg font-semibold text-gray-900 mb-1">{title}</Text>
          <Text className="text-gray-600 leading-5">{description}</Text>
        </View>
      </View>
    </Card>
  );
}

export function LandingScreen({ navigation }: Props) {
  const navigateToLogin = () => {
    navigation.navigate('Login');
  };

  const navigateToSignUp = () => {
    navigation.navigate('SignUp');
  };

  return (
    <View className="flex-1 bg-gray-50">
      <StatusBar style="dark" />

      <ScrollView className="flex-1">
        {/* Hero Section */}
        <View className="bg-gradient-to-b from-blue-600 to-blue-700 px-6 pt-16 pb-12">
          <View className="items-center">
            <View className="w-20 h-20 bg-white rounded-2xl items-center justify-center mb-4 shadow-lg">
              <Text className="text-4xl">🐕</Text>
            </View>
            <Text className="text-3xl font-bold text-white text-center mb-2">
              Pet Sitter Guide Pro
            </Text>
            <Text className="text-lg text-blue-100 text-center mb-6">
              Everything your pet sitter needs, in one place
            </Text>
            <View className="w-full gap-3 max-w-sm">
              {Platform.OS === 'web' ? (
                <>
                  <button
                    onClick={navigateToSignUp}
                    style={{
                      width: '100%',
                      padding: '14px 24px',
                      backgroundColor: 'white',
                      color: '#2563eb',
                      border: 'none',
                      borderRadius: 12,
                      fontSize: 16,
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Get Started Free
                  </button>
                  <button
                    onClick={navigateToLogin}
                    style={{
                      width: '100%',
                      padding: '14px 24px',
                      backgroundColor: 'transparent',
                      color: 'white',
                      border: '2px solid white',
                      borderRadius: 12,
                      fontSize: 16,
                      fontWeight: '600',
                      cursor: 'pointer',
                    }}
                  >
                    Sign In
                  </button>
                </>
              ) : (
                <>
                  <Button
                    title="Get Started Free"
                    onPress={navigateToSignUp}
                    variant="secondary"
                  />
                  <Button
                    title="Sign In"
                    onPress={navigateToLogin}
                    variant="outline"
                  />
                </>
              )}
            </View>
          </View>
        </View>

        {/* Problem Statement */}
        <View className="px-6 py-8 bg-white border-b border-gray-100">
          <Text className="text-2xl font-bold text-gray-900 text-center mb-4">
            Stop worrying about your pets when you travel
          </Text>
          <Text className="text-gray-600 text-center leading-6">
            No more scattered notes, forgotten instructions, or anxious phone calls.
            Create one comprehensive guide that answers every question your pet sitter might have.
          </Text>
        </View>

        {/* Features Section */}
        <View className="px-4 py-8">
          <Text className="text-2xl font-bold text-gray-900 text-center mb-2">
            Everything You Need
          </Text>
          <Text className="text-gray-500 text-center mb-6">
            Powerful features to make pet care simple
          </Text>

          {Platform.OS === 'web' ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}>
              {features.map((feature) => (
                <FeatureCard key={feature.title} {...feature} />
              ))}
            </div>
          ) : (
            features.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))
          )}
        </View>

        {/* How It Works */}
        <View className="px-6 py-8 bg-white border-y border-gray-100">
          <Text className="text-2xl font-bold text-gray-900 text-center mb-6">
            How It Works
          </Text>

          <View className="gap-6">
            <View className="flex-row items-start">
              <View className="w-10 h-10 bg-blue-600 rounded-full items-center justify-center mr-4">
                <Text className="text-white font-bold">1</Text>
              </View>
              <View className="flex-1">
                <Text className="text-lg font-semibold text-gray-900">Add Your Pets</Text>
                <Text className="text-gray-600">Enter pet profiles with feeding schedules, medications, and care details.</Text>
              </View>
            </View>

            <View className="flex-row items-start">
              <View className="w-10 h-10 bg-blue-600 rounded-full items-center justify-center mr-4">
                <Text className="text-white font-bold">2</Text>
              </View>
              <View className="flex-1">
                <Text className="text-lg font-semibold text-gray-900">Create a Guide</Text>
                <Text className="text-gray-600">Add home info, emergency contacts, and trip details to your guide.</Text>
              </View>
            </View>

            <View className="flex-row items-start">
              <View className="w-10 h-10 bg-blue-600 rounded-full items-center justify-center mr-4">
                <Text className="text-white font-bold">3</Text>
              </View>
              <View className="flex-1">
                <Text className="text-lg font-semibold text-gray-900">Share with Your Sitter</Text>
                <Text className="text-gray-600">Send a link or PDF - they get everything they need at their fingertips.</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Testimonial / Trust Section */}
        <View className="px-6 py-8">
          <Card>
            <View className="items-center py-4">
              <Text className="text-5xl mb-4">💬</Text>
              <Text className="text-lg text-gray-700 text-center italic mb-4">
                "Finally, a way to give my pet sitter all the info they need without writing a novel!"
              </Text>
              <Text className="text-gray-500">- Happy Pet Parent</Text>
            </View>
          </Card>
        </View>

        {/* CTA Section */}
        <View className="px-6 py-8 bg-blue-600">
          <View className="items-center">
            <Text className="text-2xl font-bold text-white text-center mb-2">
              Ready to Travel with Peace of Mind?
            </Text>
            <Text className="text-blue-100 text-center mb-6">
              Create your first pet care guide in minutes. It's free to get started!
            </Text>
            <View className="w-full max-w-sm">
              {Platform.OS === 'web' ? (
                <button
                  onClick={navigateToSignUp}
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    backgroundColor: 'white',
                    color: '#2563eb',
                    border: 'none',
                    borderRadius: 12,
                    fontSize: 16,
                    fontWeight: '600',
                    cursor: 'pointer',
                  }}
                >
                  Create Your Free Account
                </button>
              ) : (
                <Button
                  title="Create Your Free Account"
                  onPress={navigateToSignUp}
                  variant="secondary"
                />
              )}
            </View>
          </View>
        </View>

        {/* Footer */}
        <View className="px-6 py-6 bg-gray-100 items-center">
          <Text className="text-gray-500 text-sm">
            Pet Sitter Guide Pro® 2026
          </Text>
          <Text className="text-gray-400 text-xs mt-1">
            Made with love for pet parents everywhere
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
