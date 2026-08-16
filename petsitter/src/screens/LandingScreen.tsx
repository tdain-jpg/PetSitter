import { View, Text, ScrollView, Image, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, ScreenContainer } from '../components';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/types';

// @ts-ignore
const logo = require('../../assets/logo.png');
// @ts-ignore
const wordmark = require('../../assets/wordmark.png');

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
    // Sits directly after Care Guides because a cheat sheet is generated from a guide,
    // and because this is the only paid feature — at the end of the list a prospect
    // scrolls past the one thing they would be asked to pay for.
    icon: '👑',
    title: 'AI Cheat Sheets',
    description: 'A one-page summary your sitter can stick on the fridge, written from the guide you already filled in. Every guide gets one free with a PREVIEW watermark, and Crown unlocks them for your whole household for $5, once.',
    color: COLORS.warm,
    bgClass: 'bg-warm-50',
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

// Public pages every visitor can reach without signing in. They live on the
// ROOT stack — see RootNavigator — because Stripe's reviewer reads them
// without an account, and because a footer that demands a login to explain
// your refund policy is not a footer anyone trusts.
const FOOTER_LINKS = [
  { route: 'About', label: 'About Us' },
  { route: 'Privacy', label: 'Privacy' },
  { route: 'Terms', label: 'Terms' },
  { route: 'Refund', label: 'Refunds' },
  { route: 'Install', label: 'Install the app' },
] as const;

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
  // The footer targets sit on the ROOT stack, so they are absent from
  // AuthStackParamList. React Navigation resolves an unhandled route name on
  // the parent navigator at runtime; the cast only satisfies the child stack's
  // typing, which cannot see its parent's routes.
  const openRootScreen = (name: string) => {
    (navigation as any).navigate(name);
  };

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
        className="px-6 pt-3 pb-2"
      >
        <ScreenContainer variant="content" className="flex-row justify-end">
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
        </ScreenContainer>
      </View>

      <ScrollView className="flex-1">
        {/* Hero Section */}
        <View
          style={{ backgroundColor: COLORS.primary }}
          className="px-6 pt-6 pb-12"
        >
          <ScreenContainer variant="content">
          <View className="items-center">
            {/* Logo lockup — the two-color wordmark needs a light surface to read */}
            <View className="bg-cream-50 rounded-2xl px-5 pt-2 pb-4 mb-4 shadow-lg items-center">
              <Image
                source={logo}
                style={{ width: 140, height: 140 }}
                resizeMode="contain"
              />
              <Image
                source={wordmark}
                style={{ width: 240, height: 49, marginTop: 2 }}
                resizeMode="contain"
                accessibilityLabel="Pawstructions"
              />
            </View>
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
          </ScreenContainer>
        </View>

        {/* Problem Statement */}
        <View className="px-6 py-8 bg-cream-50 border-b border-tan-200">
          <ScreenContainer variant="content">
            <Text className="text-2xl font-bold text-brown-800 text-center mb-4">
              Stop worrying about your pets when you travel
            </Text>
            <Text className="text-tan-600 text-center leading-6">
              No more scattered notes, forgotten instructions, or anxious phone calls.
              Create one comprehensive guide that answers every question your pet sitter might have.
            </Text>
          </ScreenContainer>
        </View>

        {/* Features Section */}
        <View className="px-4 py-8 bg-cream-200">
          <ScreenContainer variant="content">
            <Text className="text-2xl font-bold text-brown-800 text-center mb-2">
              Everything You Need
            </Text>
            <Text className="text-tan-500 text-center mb-6">
              Powerful features to make pet care simple
            </Text>

            {features.map((feature) => (
              <FeatureCard key={feature.title} {...feature} />
            ))}
          </ScreenContainer>
        </View>

        {/* How It Works */}
        <View className="px-6 py-8 bg-cream-50 border-y border-tan-200">
          <ScreenContainer variant="content">
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
          </ScreenContainer>
        </View>

        {/* Why it exists. This slot previously held an invented customer quote
            attributed to "Happy Pet Parent" — a fabricated testimonial on a
            public page, which is deceptive whether or not anyone is fooled, and
            is read by Stripe's reviewer alongside our Terms. Replaced with
            something true. Put a REAL quote here once a real customer says one,
            with their name and their permission. */}
        <View className="px-6 py-8 bg-cream-200">
          <ScreenContainer variant="content">
            <Card>
              <View className="items-center py-4">
                <Text className="text-5xl mb-4">🐾</Text>
                <Text className="text-lg text-brown-700 text-center mb-2">
                  Everything your sitter needs, in one place they can actually find it.
                </Text>
                <Text className="text-tan-600 text-center">
                  Feeding times, medications, the vet's number, which neighbour has a key —
                  written down once, instead of remembered in a hurry on the way to the airport.
                </Text>
              </View>
            </Card>
          </ScreenContainer>
        </View>

        {/* CTA Section */}
        <View
          style={{ backgroundColor: COLORS.primary }}
          className="px-6 py-8"
        >
          <ScreenContainer variant="content">
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
          </ScreenContainer>
        </View>

        {/* Footer */}
        <View className="px-6 py-6 bg-cream-100">
          <ScreenContainer variant="content" className="items-center">
            {/* flex-wrap: five links do not fit on one line on a 375px phone,
                and a footer that runs off the edge is a footer nobody reads. */}
            <View className="flex-row flex-wrap items-center justify-center">
              {FOOTER_LINKS.map((link) => (
                <Pressable
                  key={link.route}
                  onPress={() => openRootScreen(link.route)}
                  accessibilityRole="button"
                  accessibilityLabel={link.label}
                  hitSlop={8}
                  className="px-2 py-1"
                >
                  <Text className="text-primary-600 text-sm font-semibold">{link.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text className="text-tan-500 text-sm mt-2">© 2026 Pawstructions</Text>
            <Text className="text-tan-400 text-xs mt-1">
              Made with love for pet parents everywhere
            </Text>
          </ScreenContainer>
        </View>
      </ScrollView>
    </View>
  );
}
