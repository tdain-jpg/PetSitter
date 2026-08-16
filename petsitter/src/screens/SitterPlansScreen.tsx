import { View, Text, ScrollView, Linking, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, ScreenContainer } from '../components';
import type { SitterPlansScreenProps } from '../navigation/types';

/**
 * What Pawstructions for Sitters will cost, told to sitters BEFORE we charge.
 *
 * Reachable only from the sitter side. An owner paying $5 once must never see a
 * $9/month plan — it makes the product look more expensive than it is, and it
 * is not their product. That is why this is its own screen rather than a
 * section of Settings or a line in /terms.
 *
 * The tone is deliberate: say the number, say when, say what early sitters
 * keep. "Free for now" with no follow-through is how you turn a future price
 * rise into a betrayal.
 */

const FEEDBACK_EMAIL = 'sitters@pawstructions.com';

export function SitterPlansScreen({ navigation }: SitterPlansScreenProps) {
  const openFeedback = () => {
    const subject = encodeURIComponent('Sitter feedback');
    const body = encodeURIComponent(
      "What would make Pawstructions genuinely useful for you?\n\n"
    );
    const url = `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`;
    // Linking.openURL rejects when no mail client is configured; swallowing it
    // is right here — a missing mail app is not an error the sitter caused, and
    // the address is printed below either way.
    void Linking.openURL(url).catch(() => {});
  };

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
        <ScreenContainer variant="content">
          <View className="flex-row items-center justify-between">
            <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
          </View>
          <View className="mt-4">
            <Text className="text-2xl font-bold text-brown-800">Sitter plans</Text>
            <Text className="text-tan-500">What this costs, and when</Text>
          </View>
        </ScreenContainer>
      </View>

      <ScrollView className="flex-1">
        <ScreenContainer variant="content">
          <Card className="mb-4 bg-warm-50 border border-warm-300">
            <Text className="text-lg font-semibold text-brown-800 mb-2">
              Pawstructions for Sitters is free right now
            </Text>
            <Text className="text-brown-700 leading-6 mb-3">
              We are new, and we would rather get this right than charge for something
              half-finished. Everything here — all your clients, your check-ins, their task
              lists — is free while we build it out.
            </Text>
            <Text className="text-brown-700 leading-6">
              When we do start charging it will be{' '}
              <Text className="font-semibold">$9 a month, or $90 a year</Text>, with up to three
              clients free for good. We are telling you now because finding out later is a
              rotten way to learn it.
            </Text>
          </Card>

          <Card className="mb-4">
            <Text className="text-base font-semibold text-brown-800 mb-2">
              Sitters who join now keep $6 a month
            </Text>
            <Text className="text-brown-700 leading-6">
              For as long as you stay subscribed. You are helping us work out what this should
              be, and that is worth something.
            </Text>
          </Card>

          <Card className="mb-4">
            <Text className="text-base font-semibold text-brown-800 mb-2">
              What would make this useful for you?
            </Text>
            <Text className="text-brown-700 leading-6 mb-4">
              We are building the sitter side right now, so this is the moment your answer
              actually changes it. Tell us what is missing, what is awkward, or what you would
              never use.
            </Text>
            <Button title="Send feedback" onPress={openFeedback} />
            <Text className="text-tan-500 text-sm mt-3">
              Or email {FEEDBACK_EMAIL}
              {Platform.OS === 'web' ? '' : ' from any mail app'}.
            </Text>
          </Card>

          <View className="mb-8" />
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
