import { useCallback, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Card, Input, ScreenContainer } from '../components';
import { dataService } from '../services';
import { showAlert, showConfirm } from '../lib/dialogs';
import { friendlyError } from '../lib/errors';
import { safeGoBack } from '../lib/goBack';
import { isSitterClientLimitError, sitterLimitMessage } from '../lib/sitterLimit';
import { COLORS } from '../constants';
import type { InviteClientScreenProps } from '../navigation/types';

/**
 * A sitter asks an owner to connect.
 *
 * The direction that grows the app. A professional sitter with twenty clients
 * who invites them is twenty qualified signups, from somebody with a direct
 * financial interest in those clients being organised.
 *
 * THE COPY'S JOB IS TO BE HONEST ABOUT WHAT THIS IS. It is a request, not a
 * grant: nothing is shared until the owner accepts, and the sitter should not
 * come away believing they now have access. Saying so here also prepares them
 * for the wait, which is what stops a second invite being sent an hour later.
 */
export function InviteClientScreen({ navigation }: InviteClientScreenProps) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const [plan, setPlan] = useState<{ activeClients: number; freeLimit: number; subscribed: boolean } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const p = await dataService.getMySitterPlan();
          if (!cancelled) setPlan(p);
        } catch {
          // The server enforces the limit either way; the banner is a courtesy.
          if (!cancelled) setPlan(null);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const send = async () => {
    const address = email.trim();
    if (!address) return;
    setSending(true);
    try {
      await dataService.inviteOwner(address);
      setSent((prev) => [...prev, address.toLowerCase()]);
      setEmail('');
      showAlert(
        'Request sent',
        `We've emailed ${address}. Nothing is shared until they accept, and you'll see them in My Clients once they do.`
      );
    } catch (error: any) {
      if (isSitterClientLimitError(error)) {
        const seePlans = await showConfirm({
          title: 'Your plan is full',
          message: sitterLimitMessage(error),
          confirmLabel: 'See plans',
          cancelLabel: 'Not now',
        });
        if (seePlans) navigation.navigate('SitterPlans');
        return;
      }
      const message = String(error?.message ?? '');
      showAlert(
        "Couldn't send",
        message.includes('already invited')
          ? "You've already asked that address, and it hasn't been answered yet."
          : message.includes('your own address')
            ? 'That is your own email address.'
            : message.includes('invalid email')
              ? `"${address}" doesn't look like an email address.`
              : friendlyError(error, 'Please try again.')
      );
    } finally {
      setSending(false);
    }
  };

  const remaining =
    plan && !plan.subscribed ? Math.max(0, plan.freeLimit - plan.activeClients) : null;

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
        <ScreenContainer variant="content">
          <Button title="← Back" onPress={() => safeGoBack(navigation)} variant="outline" />
          <View className="mt-4">
            <Text className="text-2xl font-bold text-brown-800">Invite a client</Text>
            <Text className="text-tan-500">Ask an owner to connect with you</Text>
          </View>
        </ScreenContainer>
      </View>

      <ScrollView className="flex-1 p-4">
        <ScreenContainer variant="content">
          <Card className="mb-4">
            <Text className="text-brown-700 leading-6 mb-4">
              We&apos;ll email them an invitation. They can sign up for free, and their pets,
              routines and emergency contacts appear in your client list once they accept.
            </Text>
            <Text className="text-tan-500 leading-6 mb-4">
              Nothing is shared until they say yes. You are asking for access, not taking it.
            </Text>

            <Input
              label="Their email address"
              value={email}
              onChangeText={setEmail}
              placeholder="owner@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Button
              title={sending ? 'Sending…' : 'Send invitation'}
              onPress={send}
              disabled={sending || email.trim().length === 0}
            />
          </Card>

          {remaining !== null ? (
            <Card className="mb-4">
              <Text className="text-brown-700 leading-6">
                {remaining > 0
                  ? `You can take on ${remaining} more ${
                      remaining === 1 ? 'client' : 'clients'
                    } on the free plan.`
                  : 'You are at the free plan limit, so new invitations need a subscription. Everyone you already look after is unaffected.'}
              </Text>
              {remaining === 0 ? (
                <View className="mt-3">
                  <Button
                    title="See plans"
                    onPress={() => navigation.navigate('SitterPlans')}
                    variant="outline"
                  />
                </View>
              ) : null}
            </Card>
          ) : null}

          {sent.length > 0 ? (
            <Card className="mb-4">
              <Text className="text-base font-semibold text-brown-800 mb-2">Sent just now</Text>
              {sent.map((address) => (
                <Text key={address} className="text-tan-500 leading-6">
                  {address}
                </Text>
              ))}
              <Text className="text-tan-500 text-sm mt-3">
                They appear in My Clients when they accept. Nothing to do until then.
              </Text>
            </Card>
          ) : null}

          <View className="mb-8" />
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
