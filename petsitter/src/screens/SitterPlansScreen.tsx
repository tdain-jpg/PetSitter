import { useCallback, useEffect, useRef, useState } from 'react';
import { safeGoBack } from '../lib/goBack';
import { View, Text, ScrollView, Linking, Platform, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Card, ScreenContainer } from '../components';
import { dataService } from '../services';
import { showAlert } from '../lib/dialogs';
import { friendlyError } from '../lib/errors';
import { COLORS } from '../constants';
import type { SitterPlan } from '../types';
import type { SitterPlansScreenProps } from '../navigation/types';

/**
 * What Pawstructions for Sitters costs, and where a sitter buys or cancels it.
 *
 * Reachable only from the sitter side. An owner paying $5 once must never see a
 * $9/month plan — it makes the product look more expensive than it is, and it
 * is not their product.
 *
 * WHAT CHANGED, AND WHY IT MATTERS. This screen used to promise three things
 * while nothing was for sale: "$9 a month, or $90 a year", "up to three clients
 * free for good", and "sitters who join now keep $6 a month". Now that there is
 * something to sell, two of those are honoured to the letter — three free
 * clients, and $9 a month — and the yearly price is $60 rather than the
 * promised $90, which is cheaper than advertised and therefore nobody's
 * grievance. The $6 founder rate is NOT offered here, because no such price
 * exists and no sitter ever subscribed under it; promising it again on a screen
 * that now takes money would be the first dishonest thing this app has done.
 *
 * The old screen's own docstring said it best: "free for now" with no
 * follow-through is how you turn a future price rise into a betrayal. The same
 * standard applies to a founder rate nobody can actually buy.
 */

/**
 * The one address, and it is not a new one.
 *
 * support@pawstructions.com is already promised on Refunds, Privacy, Terms and
 * About — six places, on the pages Stripe's reviewer read before approving the
 * account. A second address for sitter feedback would fragment a mailbox that
 * has to be watched anyway, and an address promised in one screen and nowhere
 * else is the kind that quietly stops being read.
 *
 * Where the mail came FROM belongs in the subject line, not in a separate
 * inbox: the domain already says which app, and the subject says which screen.
 */
const FEEDBACK_EMAIL = 'support@pawstructions.com';

const MONTHLY_LABEL = '$9 / month';
const YEARLY_LABEL = '$60 / year';

export function SitterPlansScreen({ navigation, route }: SitterPlansScreenProps) {
  const checkout = route.params?.checkout;
  const [plan, setPlan] = useState<SitterPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'monthly' | 'yearly' | 'portal' | null>(null);

  const load = useCallback(async () => {
    try {
      setPlan(await dataService.getMySitterPlan());
    } catch {
      // A plan we cannot read is not worth an error dialog on a pricing page:
      // the prices below are the point of the screen and they are static. The
      // buttons still work, and the server is the thing that actually enforces
      // the limit either way.
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch on focus, not just on mount: coming back from Stripe Checkout on
  // native is a return to a screen that never unmounted, and the whole point is
  // that the plan has just changed.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  // Fires ONCE. `checkout=success` lives in the URL, so without clearing it
  // every reload re-announced a purchase that happened minutes ago — and the
  // reload is exactly what someone does when they are checking whether it
  // worked, so the reassurance arrived precisely when it read as a glitch.
  const announcedRef = useRef(false);
  useEffect(() => {
    if (checkout !== 'success' || announcedRef.current) return;
    announcedRef.current = true;

    // Take it out of the address bar too, so a bookmark or a browser reload
    // cannot resurrect it. replaceState rather than push: this is the same
    // page, not a new one to go back to.
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        window.history.replaceState({}, '', window.location.pathname);
      } catch {
        // Not fatal. The ref above already stops it repeating in this session.
      }
    }
    // The webhook, not this screen, is what actually grants the plan, and it
    // can land a second or two after the browser does. Say something true
    // rather than something certain.
    showAlert(
      'Thanks: setting up your plan',
      "Your subscription is being confirmed. If it doesn't show here within a minute, pull the screen to refresh."
    );
  }, [checkout]);

  const openBilling = async (
    which: 'monthly' | 'yearly' | 'portal'
  ) => {
    setBusy(which);
    try {
      const url =
        which === 'portal'
          ? await dataService.createSitterPortalSession()
          : await dataService.createSitterCheckoutSession(which);
      if (Platform.OS === 'web') {
        // Same tab. A popup would be blocked as often as not, and Stripe
        // returns the browser here afterwards anyway.
        window.location.assign(url);
      } else {
        await Linking.openURL(url);
      }
    } catch (error: any) {
      showAlert('Could not open billing', friendlyError(error, 'Please try again.'));
    } finally {
      setBusy(null);
    }
  };

  const openFeedback = () => {
    const subject = encodeURIComponent('[Pawstructions] Sitter feedback');
    const body = encodeURIComponent(
      'What would make Pawstructions genuinely useful for you?\n\n'
    );
    void Linking.openURL(
      `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`
    ).catch(() => {});
  };

  const subscribed = plan?.subscribed === true;
  const used = plan?.activeClients ?? 0;
  const free = plan?.freeLimit ?? 3;
  const atLimit = !subscribed && used >= free;

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
        <ScreenContainer variant="content">
          <View className="flex-row items-center justify-between">
            <Button title="← Back" onPress={() => safeGoBack(navigation)} variant="outline" />
          </View>
          <View className="mt-4">
            <Text className="text-2xl font-bold text-brown-800">Sitter plans</Text>
            <Text className="text-tan-500">Three clients free. More when you need them.</Text>
          </View>
        </ScreenContainer>
      </View>

      <ScrollView className="flex-1">
        <ScreenContainer variant="content">
          {/* Where they stand today, before any pricing. A sitter with one
              client does not need to be sold anything, and telling them that
              first is how the page stays honest. */}
          <Card className="mb-4">
            {loading ? (
              <View className="py-2">
                <ActivityIndicator color={COLORS.secondary} />
              </View>
            ) : subscribed ? (
              <>
                <Text className="text-lg font-semibold text-brown-800 mb-1">
                  You have unlimited clients
                </Text>
                <Text className="text-brown-700 leading-6">
                  {plan?.cancelAtPeriodEnd
                    ? 'Your subscription is set to end at the end of the current period. You keep unlimited clients until then.'
                    : `You are caring for ${used} ${used === 1 ? 'household' : 'households'}.`}
                </Text>
                {plan?.status === 'past_due' ? (
                  <Text className="text-warm-700 leading-6 mt-2">
                    Your last payment did not go through. Nothing has been cut off. Update
                    your card in Manage subscription when you get a moment.
                  </Text>
                ) : null}
              </>
            ) : (
              <>
                <Text className="text-lg font-semibold text-brown-800 mb-1">
                  {used} of {free} free clients used
                </Text>
                <Text className="text-brown-700 leading-6">
                  {atLimit
                    ? 'You can keep every client you have. A subscription is only needed to take on another one.'
                    : `You can take on ${free - used} more ${
                        free - used === 1 ? 'client' : 'clients'
                      } without paying anything.`}
                </Text>
              </>
            )}
          </Card>

          {/* Coming back from the portal having cancelled. Deliberately not a
              survey: people leaving do not want a form, and Stripe already
              collects a cancellation reason at the moment they give it. This is
              only the courtesy of acknowledging it, and of saying plainly what
              they keep and for how long. */}
          {checkout === 'done' && plan?.cancelAtPeriodEnd ? (
            <Card className="mb-4">
              <Text className="text-lg font-semibold text-brown-800 mb-1">
                Sorry to see you go
              </Text>
              <Text className="text-brown-700 leading-6">
                You keep unlimited clients until the end of the period you have already paid
                for, and nothing is removed from your account. You are welcome back any time,
                and your clients will still be here.
              </Text>
            </Card>
          ) : null}

          {subscribed ? (
            <Card className="mb-4">
              <Text className="text-base font-semibold text-brown-800 mb-2">
                Manage your subscription
              </Text>
              <Text className="text-brown-700 leading-6 mb-4">
                Change plan, update your card, or cancel. Cancelling takes effect at the end
                of the period you have already paid for. You are never cut off mid-month.
              </Text>
              <Button
                title={busy === 'portal' ? 'Opening…' : 'Manage subscription'}
                onPress={() => openBilling('portal')}
                disabled={busy !== null}
              />
            </Card>
          ) : (
            <>
              <Card className="mb-4 bg-warm-50 border border-warm-300">
                <Text className="text-lg font-semibold text-brown-800 mb-2">
                  Unlimited clients
                </Text>
                <Text className="text-brown-700 leading-6 mb-4">
                  Everything else stays exactly as it is. Every guide, routine and cheat
                  sheet is already included, for free, for every sitter. The subscription
                  buys one thing: as many client households as you can handle.
                </Text>
                <Button
                  title={busy === 'monthly' ? 'Opening…' : MONTHLY_LABEL}
                  onPress={() => openBilling('monthly')}
                  disabled={busy !== null}
                />
                <View className="h-3" />
                <Button
                  title={busy === 'yearly' ? 'Opening…' : `${YEARLY_LABEL}, save $48`}
                  onPress={() => openBilling('yearly')}
                  variant="secondary"
                  disabled={busy !== null}
                />
                <Text className="text-tan-500 text-sm mt-3">
                  Cancel any time. Cancelling keeps you running until the end of the period
                  you have paid for.
                </Text>
              </Card>

              <Card className="mb-4">
                <Text className="text-base font-semibold text-brown-800 mb-2">
                  Three clients stay free, for good
                </Text>
                <Text className="text-brown-700 leading-6">
                  Minding a neighbour&apos;s cat should not cost anything, and it never will.
                  The plan is for sitters doing this as a business, and nobody is ever
                  disconnected from a household they already look after.
                </Text>
              </Card>
            </>
          )}

          <Card className="mb-4">
            <Text className="text-base font-semibold text-brown-800 mb-2">
              What would make this more useful?
            </Text>
            <Text className="text-brown-700 leading-6 mb-4">
              We are building the sitter side right now, so this is the moment your answer
              actually changes it.
            </Text>
            <Button title="Send feedback" onPress={openFeedback} variant="outline" />
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
