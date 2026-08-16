import type { ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from './ScreenContainer';
import { formatDate } from '../lib/dates';
import { useAuth } from '../contexts/AuthContext';
import type { RootStackParamList } from '../navigation/types';

/**
 * Shared chrome for the four public trust pages (About, Privacy, Terms,
 * Refund).
 *
 * They are ordinary reading screens, but they carry two constraints the rest
 * of the app does not:
 *
 *  1. They must render for a signed-OUT visitor who arrived by typing the URL,
 *     because Stripe's reviewer has no login. So "go back" cannot be assumed —
 *     see goHome below.
 *  2. Each of them cross-links to the other three. Someone checking whether a
 *     $5 charge is safe reads all four, and making them hunt through the
 *     footer of a marketing page between each one is a bad way to earn trust.
 *
 * Imported directly rather than through components/index.ts: DataContext pulls
 * SessionExpiredNotice out of this folder, and routing that through the barrel
 * (which re-exports JourneyCards, a useData consumer) would close an import
 * cycle.
 */

type TrustRoute = 'About' | 'Privacy' | 'Terms' | 'Refund';

// Insertion order is the order the cross-links render in.
const PAGE_LABELS: Record<TrustRoute, string> = {
  About: 'About Us',
  Privacy: 'Privacy',
  Terms: 'Terms',
  Refund: 'Refunds',
};

// Policy dates read better spelled out than in the app's default weekday-first
// format: "August 15, 2026", not "Fri, Aug 15, 2026".
const LAST_UPDATED_FORMAT: Intl.DateTimeFormatOptions = {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
};

interface TrustPageProps {
  /** Which page this is — excluded from its own cross-link row. */
  route: TrustRoute;
  title: string;
  /** Lead paragraph under the title. */
  intro?: string;
  /** 'YYYY-MM-DD' — the day this page's wording last changed. */
  lastUpdated: string;
  children: ReactNode;
}

export function TrustPage({ route, title, intro, lastUpdated, children }: TrustPageProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { isAuthenticated } = useAuth();
  const canGoBack = navigation.canGoBack();

  // A visitor who typed /privacy has nothing to go back TO, and a dead-end is
  // exactly the wrong impression for a page whose job is reassurance. Send
  // them into the app instead: the signed-out stack opens on the marketing
  // page, the signed-in one on their dashboard.
  const goHome = () => {
    if (isAuthenticated) navigation.navigate('Main');
    else navigation.navigate('Auth');
  };

  const otherPages = (Object.keys(PAGE_LABELS) as TrustRoute[]).filter((r) => r !== route);

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingTop: 48 }}>
        <ScreenContainer variant="content">
          {canGoBack && (
            <Pressable
              onPress={() => navigation.goBack()}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              className="py-2 mb-2 self-start"
            >
              <Text className="text-secondary-600 text-sm">← Back</Text>
            </Pressable>
          )}

          <Text accessibilityRole="header" className="text-3xl font-bold text-brown-800 mb-1">
            {title}
          </Text>
          <Text className="text-tan-500 text-sm mb-4">
            Last updated {formatDate(lastUpdated, LAST_UPDATED_FORMAT)}
          </Text>

          {intro ? <Text className="text-brown-700 leading-6 mb-6">{intro}</Text> : null}

          {children}

          {/* Cross-links + a way home, on every page. */}
          <View className="border-t border-tan-200 mt-2 pt-5 pb-8">
            <View className="flex-row flex-wrap items-center">
              {otherPages.map((page) => (
                <Pressable
                  key={page}
                  onPress={() => navigation.navigate(page)}
                  accessibilityRole="button"
                  accessibilityLabel={`Read ${PAGE_LABELS[page]}`}
                  hitSlop={8}
                  className="mr-4 mb-2"
                >
                  <Text className="text-primary-600 text-sm font-semibold">
                    {PAGE_LABELS[page]}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                onPress={goHome}
                accessibilityRole="button"
                accessibilityLabel="Back to Pawstructions"
                hitSlop={8}
                className="mr-4 mb-2"
              >
                <Text className="text-primary-600 text-sm font-semibold">
                  Back to Pawstructions
                </Text>
              </Pressable>
            </View>
            <Text className="text-tan-400 text-xs mt-1">© 2026 Pawstructions</Text>
          </View>
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}

/** A titled block of prose. */
export function TrustSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <View className="mb-6">
      <Text accessibilityRole="header" className="text-lg font-semibold text-brown-800 mb-2">
        {heading}
      </Text>
      {children}
    </View>
  );
}

/** A paragraph inside a TrustSection. */
export function TrustText({ children }: { children: ReactNode }) {
  return <Text className="text-brown-700 leading-6 mb-3">{children}</Text>;
}

/** A bullet inside a TrustSection. */
export function TrustBullet({ children }: { children: ReactNode }) {
  return (
    <View className="flex-row mb-2">
      <Text className="text-tan-500 mr-2 leading-6">•</Text>
      <Text className="flex-1 text-brown-700 leading-6">{children}</Text>
    </View>
  );
}
