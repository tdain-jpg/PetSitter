import { View, Text, Pressable, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, ScreenContainer } from '../components';
import type { InstallScreenProps } from '../navigation/types';

function Step({ number, children }: { number: number; children: string }) {
  return (
    <View className="flex-row items-start mb-3">
      <View className="w-7 h-7 rounded-full bg-primary-500 items-center justify-center mr-3 mt-0.5">
        <Text className="text-white font-bold text-sm">{number}</Text>
      </View>
      <Text className="flex-1 text-brown-700 leading-6">{children}</Text>
    </View>
  );
}

function PlatformHeading({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <View className="flex-row items-center mb-4">
      <View className="w-12 h-12 rounded-xl bg-primary-50 items-center justify-center mr-4">
        <Text className="text-2xl">{icon}</Text>
      </View>
      <View className="flex-1">
        <Text accessibilityRole="header" className="text-lg font-semibold text-brown-800">
          {title}
        </Text>
        <Text className="text-tan-500 text-sm">{subtitle}</Text>
      </View>
    </View>
  );
}

export function InstallScreen({ navigation }: InstallScreenProps) {
  const canGoBack = navigation.canGoBack();

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingTop: 48 }}
      >
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

          <Text accessibilityRole="header" className="text-3xl font-bold text-brown-800 mb-2">
            Install Pawstructions
          </Text>
          <Text className="text-tan-600 leading-6 mb-6">
            Pawstructions works like a real app — launched from your home screen, full
            screen, always signed in. No app store, no download, and it takes about
            ten seconds.
          </Text>

          <Card className="mb-4">
            <PlatformHeading icon="📱" title="iPhone & iPad" subtitle="Safari" />
            <Step number={1}>Open Pawstructions in Safari (installing only works from Safari).</Step>
            <Step number={2}>Tap the Share button — the square with an arrow pointing up — at the bottom of the screen.</Step>
            <Step number={3}>Scroll down the share sheet and tap "Add to Home Screen".</Step>
            <Step number={4}>Tap "Add" in the top corner. Pawstructions now lives on your home screen.</Step>
          </Card>

          <Card className="mb-4">
            <PlatformHeading icon="🤖" title="Android" subtitle="Chrome" />
            <Step number={1}>Open Pawstructions in Chrome.</Step>
            <Step number={2}>Tap the three-dot menu in the top corner.</Step>
            <Step number={3}>Tap "Install app" (on some phones it says "Add to Home screen").</Step>
            <Step number={4}>Confirm the prompt — or if Chrome shows an install banner on its own, just accept it.</Step>
          </Card>

          <Card className="mb-4">
            <PlatformHeading icon="💻" title="Desktop" subtitle="Chrome or Edge" />
            <Step number={1}>Open Pawstructions in Chrome or Edge.</Step>
            <Step number={2}>Click the install icon at the right end of the address bar — a small screen with a down arrow.</Step>
            <Step number={3}>Click "Install" and Pawstructions opens in its own window.</Step>
          </Card>

          <View className="bg-primary-50 border border-primary-100 rounded-xl p-4 mb-6">
            <Text className="text-brown-800 font-semibold mb-1">Why install?</Text>
            <Text className="text-brown-700 leading-6">
              The installed app opens instantly, keeps you signed in, and works even
              with a spotty connection — handy for sitters checking feeding
              instructions from your kitchen.
            </Text>
          </View>

          {canGoBack && (
            <Button
              title="Back to Pawstructions"
              onPress={() => navigation.goBack()}
              variant="primary"
            />
          )}
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
