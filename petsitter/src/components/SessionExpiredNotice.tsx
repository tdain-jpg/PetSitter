import { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button } from './Button';
import { Card } from './Card';
import { Icon } from './Icon';
import { ScreenContainer } from './ScreenContainer';

/**
 * Shown in place of the whole app when the user's sign-in is confirmed dead
 * (see src/lib/sessionExpired.ts and the DataProvider render).
 *
 * The copy has one job: an expired token looks exactly like deleted data from
 * the outside, so say which one it is before anything else. Imported directly
 * rather than through components/index.ts — the barrel re-exports JourneyCards,
 * which consumes DataContext, and routing this through it would close an
 * import cycle.
 */
export function SessionExpiredNotice({ onSignIn }: { onSignIn: () => Promise<void> }) {
  const [signingOut, setSigningOut] = useState(false);
  // supabase-js clears the local session even when the server rejects the
  // logout, so this only surfaces when we genuinely could not act — offline,
  // in practice. Saying so beats a button that appears to do nothing.
  const [failed, setFailed] = useState(false);

  const handlePress = async () => {
    setSigningOut(true);
    setFailed(false);
    try {
      await onSignIn();
    } catch (err) {
      console.error('Could not clear the expired session:', err);
      setFailed(true);
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />
      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingTop: 64 }}>
        <ScreenContainer variant="form">
          <Card>
            <View className="items-center mb-4">
              <Icon name="key" size={56} />
            </View>
            <Text
              accessibilityRole="header"
              className="text-2xl font-bold text-brown-800 text-center mb-3"
            >
              Your sign-in expired
            </Text>
            <Text className="text-brown-700 leading-6 text-center mb-3">
              Pawstructions stopped being able to load your pets and guides, because this
              device is no longer signed in.
            </Text>
            <Text className="text-brown-700 leading-6 text-center mb-6">
              This is a sign-in problem, not a data problem. Your pets, guides and share links
              are all still on your account — signing in again brings them straight back.
            </Text>
            <Button
              title="Sign in again"
              onPress={handlePress}
              loading={signingOut}
              disabled={signingOut}
            />
            {failed && (
              <Text className="text-accent-600 text-sm text-center mt-3 leading-5">
                We couldn’t finish signing you out. Check your connection and try again.
              </Text>
            )}
          </Card>
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
