import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Platform, Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Card, ScreenContainer, ScreenHeader } from '../components';
import { useData } from '../contexts';
import { dataService } from '../services';
import { showAlert } from '../lib/dialogs';
import { friendlyError } from '../lib/errors';
import { formatDate } from '../lib/dates';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { OwnerPlan } from '../types';

type Props = NativeStackScreenProps<MainStackParamList, 'UnlockCrown'>;

/**
 * Pawstructions Plus, the owner plan (0045, Tim 2026-10-21): $3/month or
 * $24/year per household, no trial. It replaced the one-time Crown, so it
 * lives at Crown's old route: Stripe return links and old buttons that point
 * at UnlockCrown land here. Households that bought Crown keep it, and are
 * told so instead of being offered anything.
 */
const FREE = [
  'Pets, guides, share links and PDFs, unlimited',
  'Family sharing and Home details',
  'A sitter with the live checklist, check-ins and photos for 2 trips a year',
  'One AI cheat sheet per guide, with a PREVIEW watermark',
];
const PLUS = [
  'Live sitter features on every trip, all year',
  'Unlimited AI cheat sheets, no watermark, rewrite any time',
  'For everyone in your household',
];

function Ticks({ items }: { items: string[] }) {
  return (
    <View className="mt-1">
      {items.map((t) => (
        <Text key={t} className="text-brown-700 leading-6">
          ✓ {t}
        </Text>
      ))}
    </View>
  );
}

export function PlusScreen({ route }: Props) {
  const { primaryHouseholdId } = useData();
  const [plan, setPlan] = useState<OwnerPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'monthly' | 'yearly' | 'portal' | null>(null);
  const checkout = (route.params as { checkout?: string } | undefined)?.checkout;

  const load = useCallback(async () => {
    if (!primaryHouseholdId) return null;
    try {
      const p = await dataService.getOwnerPlan(primaryHouseholdId);
      setPlan(p);
      return p;
    } catch {
      setPlan(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [primaryHouseholdId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // Back from Stripe after paying: the webhook grants Plus a moment later, so
  // say something true, then look again a few times. Once only, and the
  // ?checkout= is taken out of the address bar so a reload does not repeat it.
  const announced = useRef(false);
  useEffect(() => {
    if (checkout !== 'success' || announced.current || !primaryHouseholdId) return;
    announced.current = true;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        window.history.replaceState({}, '', window.location.pathname);
      } catch {
        // not fatal
      }
    }
    showAlert('Thank you', 'Your plan is being confirmed. It usually takes a few seconds.');
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      const p = await load();
      if (p?.has_plus || tries >= 6) clearInterval(timer);
    }, 2500);
    return () => clearInterval(timer);
  }, [checkout, primaryHouseholdId, load]);

  const open = async (which: 'monthly' | 'yearly' | 'portal') => {
    setBusy(which);
    try {
      const url =
        which === 'portal'
          ? await dataService.createPlusPortalSession()
          : await dataService.createPlusCheckoutSession(which);
      if (Platform.OS === 'web') window.location.assign(url);
      else await Linking.openURL(url);
    } catch (error) {
      showAlert('Could not open billing', friendlyError(error, 'Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const ends = plan?.period_end ? formatDate(plan.period_end.slice(0, 10), { month: 'long', day: 'numeric', year: 'numeric' }) : '';

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />
      <ScreenHeader title="Pawstructions Plus" />
      <ScrollView className="flex-1">
        <ScreenContainer variant="content" className="p-4">
          {loading ? (
            <View className="py-16 items-center">
              <ActivityIndicator color={COLORS.primary} />
            </View>
          ) : plan?.via === 'crown' ? (
            <Card className="mb-4 bg-warm-50 border border-warm-300">
              <Text className="text-lg font-semibold text-brown-800 mb-1">👑 Your household has Crown</Text>
              <Text className="text-brown-700 leading-6">
                Crown includes everything in Plus, forever. There is nothing to pay.
              </Text>
              <Ticks items={PLUS} />
            </Card>
          ) : plan?.has_plus ? (
            <Card className="mb-4 bg-primary-50 border border-primary-200">
              <Text className="text-lg font-semibold text-brown-800 mb-1">You have Plus</Text>
              <Text className="text-brown-700 leading-6 mb-1">
                {plan.cancel_at_period_end
                  ? `Your plan ends on ${ends}. You keep everything until then.`
                  : `${plan.interval === 'year' ? '$24 a year' : '$3 a month'}${ends ? `, renews on ${ends}` : ''}.`}
              </Text>
              {plan.status === 'past_due' ? (
                <Text className="text-warm-700 leading-6 mb-1">
                  Your last payment did not go through. Nothing has been cut off. Update your card in
                  Manage subscription when you get a moment.
                </Text>
              ) : null}
              <Ticks items={PLUS} />
              <View className="mt-4">
                <Button
                  title={busy === 'portal' ? 'Opening…' : 'Manage subscription'}
                  onPress={() => open('portal')}
                  disabled={busy !== null}
                  variant="outline"
                />
              </View>
            </Card>
          ) : (
            <>
              <Card className="mb-4">
                <Text className="text-lg font-semibold text-brown-800 mb-1">Free, for every household</Text>
                <Ticks items={FREE} />
                {plan ? (
                  <Text className="text-tan-600 text-sm mt-3">
                    Sitter trips this year: {Math.min(plan.trips_used_this_year, plan.free_trips)} of {plan.free_trips} free
                    used.
                  </Text>
                ) : null}
              </Card>
              <Card className="mb-4 bg-primary-50 border border-primary-200">
                <Text className="text-lg font-semibold text-brown-800 mb-1">Plus</Text>
                <Text className="text-brown-700 leading-6">For households that travel more than twice a year.</Text>
                <Ticks items={PLUS} />
                <View className="gap-3 mt-4">
                  <Button
                    title={busy === 'monthly' ? 'Opening…' : '$3 a month'}
                    onPress={() => open('monthly')}
                    disabled={busy !== null || !primaryHouseholdId}
                  />
                  <Button
                    title={busy === 'yearly' ? 'Opening…' : '$24 a year (save a third)'}
                    onPress={() => open('yearly')}
                    disabled={busy !== null || !primaryHouseholdId}
                    variant="outline"
                  />
                </View>
                <Text className="text-tan-600 text-sm mt-3 leading-5">
                  Cancel anytime; Plus lasts to the end of the period you paid for. Have a promo code?
                  Enter it at checkout on the monthly plan.
                </Text>
              </Card>
            </>
          )}
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
