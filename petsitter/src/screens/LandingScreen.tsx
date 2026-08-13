import { View, Text, ScrollView, Image, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card } from '../components';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';

// @ts-ignore
const logo = require('../../assets/logo.png');
// @ts-ignore
const wordmarkWhite = require('../../assets/wordmark-white.png');

type Props = NativeStackScreenProps<AuthStackParamList, 'Landing'>;

// Icon-chip tints come from the brand token scales (teal/navy/gold/accent) —
// no raw hex values, so a palette swap restyles these along with everything else.
const features = [
  {
    icon: '🐾',
    title: 'Pet Profiles',
    description: 'Store all your pet information in one place - feeding schedules, medications, vet info, and more.',
    color: COLORS.primary,
    bgClass: 'bg-primary-50',
  },
  {
    icon: '📋',
    title: 'Care Guides',
    description: 'Create comprehensive guides with home info, emergency contacts, and daily routines.',
    color: COLORS.secondary,
    bgClass: 'bg-secondary-50',
  },
  {
    icon: '✅',
    title: 'Daily Checklists',
    description: 'Generate interactive checklists organized by time of day for your pet sitter.',
    color: COLORS.success,
    bgClass: 'bg-primary-100',
  },
  {
    icon: '📄',
    title: 'PDF Export',
    description: 'Export your guides as professional PDFs to print or share digitally.',
    color: COLORS.warm,
    bgClass: 'bg-warm-100',
  },
  {
    icon: '🔗',
    title: 'Easy Sharing',
    description: 'Share read-only links with your pet sitter - no account required for them to view.',
    color: COLORS.accent,
    bgClass: 'bg-accent-50',
  },
];

function FeatureCard({ icon, title, description, color, bgClass }: {
  icon: string;
  title: string;
  description: string;
  color: string;
  bgClass: string;
}) {
  return (
    <Card className="mb-4">
      <View className="flex-row items-start">
        <View
          className={`w-12 h-12 rounded-xl items-center justify-center mr-4 ${bgClass}`}
        >
          <Text className="text-2xl">{icon}</Text>
        </View>
        <View className="flex-1">
          <Text className="text-lg font-semibold text-brown-800 mb-1">{title}</Text>
          <Text className="text-tan-600 leading-5">{description}</Text>
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
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      {/* Top nav bar for returning users */}
      <View
        style={{ backgroundColor: COLORS.primary }}
        className="px-6 pt-3 pb-2 flex-row justify-end"
      >
        <Pressable
          onPress={navigateToLogin}
          accessibilityRole="button"
          accessibilityLabel="Sign in to existing account"
          className="px-3 py-1.5"
        >
          <Text style={{ color: COLORS.white }} className="text-base font-semibold">
            Sign In
          </Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1">
        {/* Hero Section */}
        <View
          style={{ backgroundColor: COLORS.primary }}
          className="px-6 pt-6 pb-12"
        >
          <View className="items-center">
            {/* Logo */}
            <View className="bg-cream-50 rounded-2xl p-2 mb-4 shadow-lg">
              <Image
                source={logo}
                style={{ width: 140, height: 140 }}
                resizeMode="contain"
              />
            </View>
            <Image
              source={wordmarkWhite}
              style={{ width: 260, height: 38, marginBottom: 8 }}
              resizeMode="contain"
              accessibilityLabel="Pawstructions"
            />
            {/* White on primary-500 — the only body-size pairing that clears 4.5:1 */}
            <Text style={{ color: COLORS.white }} className="text-lg text-center mb-6 italic">
              Where Pets Rule the Kingdom!
            </Text>
            <View className="w-full max-w-sm">
              <Button
                title="Get Started Free"
                onPress={navigateToSignUp}
                variant="secondary"
              />
            </View>
          </View>
        </View>

        {/* Problem Statement */}
        <View className="px-6 py-8 bg-cream-50 border-b border-tan-200">
          <Text className="text-2xl font-bold text-brown-800 text-center mb-4">
            Stop worrying about your pets when you travel
          </Text>
          <Text className="text-tan-600 text-center leading-6">
            No more scattered notes, forgotten instructions, or anxious phone calls.
            Create one comprehensive guide that answers every question your pet sitter might have.
          </Text>
        </View>

        {/* Features Section */}
        <View className="px-4 py-8 bg-cream-200">
          <Text className="text-2xl font-bold text-brown-800 text-center mb-2">
            Everything You Need
          </Text>
          <Text className="text-tan-500 text-center mb-6">
            Powerful features to make pet care simple
          </Text>

          {features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </View>

        {/* How It Works */}
        <View className="px-6 py-8 bg-cream-50 border-y border-tan-200">
          <Text className="text-2xl font-bold text-brown-800 text-center mb-6">
            How It Works
          </Text>

          <View className="gap-6">
            <View className="flex-row items-start">
              <View
                style={{ backgroundColor: COLORS.primary }}
                className="w-10 h-10 rounded-full items-center justify-center mr-4"
              >
                <Text className="text-white font-bold">1</Text>
              </View>
              <View className="flex-1">
                <Text className="text-lg font-semibold text-brown-800">Add Your Pets</Text>
                <Text className="text-tan-600">Enter pet profiles with feeding schedules, medications, and care details.</Text>
              </View>
            </View>

            <View className="flex-row items-start">
              <View
                style={{ backgroundColor: COLORS.primary }}
                className="w-10 h-10 rounded-full items-center justify-center mr-4"
              >
                <Text className="text-white font-bold">2</Text>
              </View>
              <View className="flex-1">
                <Text className="text-lg font-semibold text-brown-800">Create a Guide</Text>
                <Text className="text-tan-600">Add home info, emergency contacts, and trip details to your guide.</Text>
              </View>
            </View>

            <View className="flex-row items-start">
              <View
                style={{ backgroundColor: COLORS.primary }}
                className="w-10 h-10 rounded-full items-center justify-center mr-4"
              >
                <Text className="text-white font-bold">3</Text>
              </View>
              <View className="flex-1">
                <Text className="text-lg font-semibold text-brown-800">Share with Your Sitter</Text>
                <Text className="text-tan-600">Send a link or PDF - they get everything they need at their fingertips.</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Testimonial / Trust Section */}
        <View className="px-6 py-8 bg-cream-200">
          <Card>
            <View className="items-center py-4">
              <Text className="text-5xl mb-4">💬</Text>
              <Text className="text-lg text-brown-700 text-center italic mb-4">
                "Finally, a way to give my pet sitter all the info they need without writing a novel!"
              </Text>
              <Text className="text-tan-500">- Happy Pet Parent</Text>
            </View>
          </Card>
        </View>

        {/* CTA Section */}
        <View
          style={{ backgroundColor: COLORS.primary }}
          className="px-6 py-8"
        >
          <View className="items-center">
            <Text style={{ color: COLORS.cream }} className="text-2xl font-bold text-center mb-2">
              Ready to Travel with Peace of Mind?
            </Text>
            <Text style={{ color: COLORS.white }} className="text-center mb-6">
              Create your first pet care guide in minutes. It's free to get started!
            </Text>
            <View className="w-full max-w-sm">
              <Button
                title="Create Your Free Account"
                onPress={navigateToSignUp}
                variant="secondary"
              />
            </View>
            <View className="flex-row items-center justify-center mt-4">
              <Text style={{ color: COLORS.white }}>Already have an account? </Text>
              <Pressable
                onPress={navigateToLogin}
                accessibilityRole="button"
                accessibilityLabel="Sign in to existing account"
              >
                <Text style={{ color: COLORS.white }} className="font-semibold underline">
                  Sign in
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Footer */}
        <View className="px-6 py-6 bg-cream-100 items-center">
          <Text className="text-tan-500 text-sm">
            Pawstructions® 2026
          </Text>
          <Text className="text-tan-400 text-xs mt-1">
            Made with love for pet parents everywhere
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
