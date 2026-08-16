import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Platform, Linking } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, ScreenContainer, ScreenHeader } from '../components';
import { useData } from '../contexts';
import { supabase } from '../lib/supabase';
import { dataService } from '../services/SupabaseAdapter';
import { showAlert } from '../lib/showAlert';
import { COLORS } from '../constants';
import type { UnlockCrownScreenProps } from '../navigation/types';

/**
 * UnlockCrownScreen — the one-time Crown purchase.
 *
 * Crown is $5 ONCE, per HOUSEHOLD, permanent. Every line of copy here has to
 * survive being read by someone deciding whether to hand us money: no implied
 * subscription, no claim that a payment succeeded before the entitlement says
 * so, and the household being unlocked is named on screen because a user in
 * two households would otherwise have no way to tell which one they bought.
 *
 * Entitlement is read ONLY through has_crown(h) — the membership-gated RPC —
 * never from a households column, so this screen can never become an oracle
 * for whether some other household has paid.
 */

type CheckoutReturn = 'success' | 'cancelled';

/**
 * Stripe returns the buyer to /Main/UnlockCrown?checkout=success|cancelled
 * (&guideId=…) — the exact values are built by returnUrl() in the
 * create-checkout-session Edge Function; keep the two in step.
 *
 * The route type declares only `guideId` (navigation/types.ts owns it), and an
 * undeclared query param arrives as a plain string, so read it defensively and
 * treat anything unrecognised as absent. It never decides whether Crown is ON —
 * has_crown is the only source of truth for that — it refines the copy, arms
 * the auto-poll (`success`) and retires a stored record once (`cancelled`, via
 * the latch in the screen). This screen behaves correctly when the param never
 * arrives at all, which on native is every time.
 */
function readCheckoutReturn(params: unknown): CheckoutReturn | null {
  const value = (params as { checkout?: unknown } | undefined)?.checkout;
  return value === 'success' || value === 'cancelled' ? value : null;
}

/**
 * How long to wait before each automatic re-check of has_crown after a
 * successful return from Stripe. The redirect back is effectively instant
 * while the webhook takes a beat, so "paid, but has_crown is still false" is
 * the NORMAL first paint on return — without this the user has to know to tap
 * Refresh, and the obvious alternative interpretation is "my payment failed".
 *
 * BOUNDED on purpose: five attempts backing off over ~22s and then it stops
 * for good. An unbounded interval would keep hitting the RPC forever on a
 * screen someone walked away from.
 */
const WEBHOOK_POLL_DELAYS_MS = [1500, 2500, 4000, 6000, 8000];

/**
 * Purchases we have handed to Stripe and not yet seen an entitlement for.
 *
 * These have to OUTLIVE the screen instance. `?checkout=success` lives on one
 * navigation state: a single Back or Home tap discards it, and the buyer would
 * be looking at a live $5 button with a payment already in flight —
 * create-checkout-session gates only on has_crown and would happily mint a
 * second session. Native never even gets the param (see the focus effect), so
 * there the record is the ONLY thing standing between a slow webhook and a
 * second charge.
 *
 * Keyed by household because Crown is: an entry only speaks for the household
 * it is filed under, so someone who belongs to two can still buy the second
 * while the first is still settling. (A single-record slot would have the
 * second purchase silently erase the first household's in-flight record.)
 * The value is the startedAt millisecond stamp — see PENDING_CHECKOUT_TTL_MS.
 */
type PendingCheckouts = Record<string, number>;

const PENDING_CHECKOUT_KEY = 'pawstructions.crown.pendingCheckouts';

/**
 * How long a recorded checkout keeps the $5 button hidden.
 *
 * The risk it covers is the gap between tapping buy and the webhook landing,
 * which is dominated by the buyer's own time on Stripe's page — card entry
 * plus a bank 3-D Secure hop is minutes at worst, so fifteen leaves several
 * times over the slack.
 *
 * It has to EXPIRE because abandonment is silent on native: Stripe's cancel
 * URL is an https://pawstructions.com address that opens in the system
 * browser, so an app that never hears about the cancel would otherwise sit on
 * a hidden purchase button forever. Fifteen minutes turns that into a bounded
 * wait. (On web the cancel return clears that household's record outright the
 * first time it is seen — see `cancelledReturn`.)
 */
const PENDING_CHECKOUT_TTL_MINUTES = 15;
const PENDING_CHECKOUT_TTL_MS = PENDING_CHECKOUT_TTL_MINUTES * 60_000;

/**
 * AsyncStorage on both platforms — its web build is backed by localStorage, so
 * this is one code path rather than two.
 *
 * Every call swallows its own failure. A storage error (Safari private mode
 * refuses to write) must never block a purchase, and a failed READ degrades to
 * "no record", which is exactly the param-only behaviour this screen had
 * before — never to a false claim that a payment is in flight.
 */
async function readPendingCheckouts(): Promise<PendingCheckouts> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_CHECKOUT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const records: PendingCheckouts = {};
    for (const [id, startedAt] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof startedAt === 'number' && Number.isFinite(startedAt)) {
        records[id] = startedAt;
      }
    }
    return records;
  } catch {
    return {};
  }
}

/**
 * Drop entries past the TTL on the way out. They already count for nothing
 * (pendingForThisHousehold applies the same window), so this only keeps the
 * slot from accumulating households the user has long since left.
 */
function pruneExpired(records: PendingCheckouts, now: number): PendingCheckouts {
  const fresh: PendingCheckouts = {};
  for (const [id, startedAt] of Object.entries(records)) {
    if (now - startedAt < PENDING_CHECKOUT_TTL_MS) fresh[id] = startedAt;
  }
  return fresh;
}

function withoutHousehold(
  records: PendingCheckouts | undefined,
  householdId: string
): PendingCheckouts {
  const next = { ...(records ?? {}) };
  delete next[householdId];
  return next;
}

/**
 * Merges into the stored map rather than replacing it, so starting a checkout
 * for one household leaves another household's in-flight record intact.
 */
async function writePendingCheckout(householdId: string, startedAt: number): Promise<void> {
  try {
    const existing = await readPendingCheckouts();
    await AsyncStorage.setItem(
      PENDING_CHECKOUT_KEY,
      JSON.stringify({ ...pruneExpired(existing, startedAt), [householdId]: startedAt })
    );
  } catch {
    // See above: a purchase must still be startable on a device that won't
    // persist. The `checkout=success` param remains the web safety net.
  }
}

async function clearPendingCheckout(householdId: string): Promise<void> {
  try {
    const remaining = pruneExpired(
      withoutHousehold(await readPendingCheckouts(), householdId),
      Date.now()
    );
    if (Object.keys(remaining).length === 0) {
      await AsyncStorage.removeItem(PENDING_CHECKOUT_KEY);
    } else {
      await AsyncStorage.setItem(PENDING_CHECKOUT_KEY, JSON.stringify(remaining));
    }
  } catch {
    // A record we failed to delete expires on its own within
    // PENDING_CHECKOUT_TTL_MINUTES.
  }
}

export function UnlockCrownScreen({ navigation, route }: UnlockCrownScreenProps) {
  const guideId = route.params?.guideId;
  const checkoutReturn = readCheckoutReturn(route.params);

  const {
    guides,
    loadingGuides,
    households,
    householdsLoading,
    primaryHouseholdId,
    refreshHouseholds,
  } = useData();

  // null = not checked yet (or unknowable). Distinct from false, which is a
  // real "this household has not paid".
  const [hasCrown, setHasCrown] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);
  const [checkFailed, setCheckFailed] = useState(false);
  const [starting, setStarting] = useState(false);
  // The post-checkout auto-poll has run out of attempts. Only ever set true;
  // the copy softens at that point, it does not re-open the purchase path.
  const [pollExhausted, setPollExhausted] = useState(false);
  // The persisted in-flight purchases, keyed by household. `undefined` =
  // storage not read yet, and is deliberately distinct from an empty map: the
  // first paint blocks on it rather than guess, because guessing wrong shows a
  // $5 button to someone mid-payment.
  const [pendingCheckouts, setPendingCheckouts] = useState<PendingCheckouts | undefined>(
    undefined
  );
  // `?checkout=cancelled` reports ONE event — the buyer walked away from the
  // session that was in flight when Stripe sent them back — but the param
  // lives for the whole route entry. Everything below therefore reads the
  // latched `cancelledReturn`, not the raw param: without the latch a buyer
  // who cancels once and then starts a REAL checkout from this same screen
  // entry gets no double-charge guard at all (awaitingWebhook could never
  // become true, and the effect below would delete the fresh record the moment
  // it was written). Starting a new checkout is exactly when the old cancel
  // goes stale, so that is where it is spent — see handleCheckout.
  const [cancelConsumed, setCancelConsumed] = useState(false);
  const cancelledReturn = checkoutReturn === 'cancelled' && !cancelConsumed;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const records = await readPendingCheckouts();
      if (!cancelled) setPendingCheckouts(records);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const guide = guideId ? (guides.find((g) => g.id === guideId) ?? null) : null;

  // A guideId pins the purchase to THAT guide's household. Defaulting to the
  // primary household while the guides fetch is still in flight could open
  // checkout for a household the guide isn't in — the buyer would pay and the
  // sheet would stay watermarked. Resolve to null and wait instead.
  const resolvingGuide = guideId != null && !guide && loadingGuides;
  // Guides written before households existed may carry no household_id; the
  // primary household is the same fallback the server default uses for them.
  const householdId = resolvingGuide ? null : (guide?.household_id ?? primaryHouseholdId);
  const household = households.find((h) => h.id === householdId) ?? null;
  const householdLabel = household?.name ?? 'your household';

  // A stored record counts only for the household it is filed under and only
  // inside its window. A clock that jumped backwards makes the elapsed time
  // negative, which stays inside the window — the safe direction.
  const pendingStartedAt = householdId != null ? pendingCheckouts?.[householdId] : undefined;
  const pendingForThisHousehold =
    pendingStartedAt !== undefined && Date.now() - pendingStartedAt < PENDING_CHECKOUT_TTL_MS;

  // A purchase is in flight and the entitlement is NOT confirmed — covers both
  // the real false (webhook hasn't landed) and null (the read threw). While
  // this is true the $5 button must not be on screen: this user has already
  // been handed to Checkout, create-checkout-session gates only on has_crown
  // and would happily mint a second session, and a second tap is a second $5
  // charge.
  //
  // Two independent sources, because neither covers the other's case: the
  // success param survives a hard reload of a URL we control but dies on the
  // first Back or Home tap, while the stored record survives navigation and
  // app restarts but never learns about a NATIVE abandon. An UNSPENT
  // `cancelled` return is Stripe telling us outright that no payment was
  // started, which retires the record's claim on the spot rather than one
  // render later; once spent it stops speaking for anything, so the next
  // purchase is guarded normally.
  const awaitingWebhook =
    hasCrown !== true &&
    (checkoutReturn === 'success' || (!cancelledReturn && pendingForThisHousehold));

  const checkEntitlement = useCallback(async (): Promise<boolean | null> => {
    if (!householdId) return null;
    // Membership-gated: a non-member gets FALSE rather than an answer about a
    // household they don't belong to.
    const { data, error } = await supabase.rpc('has_crown', { h: householdId });
    if (error) throw new Error(error.message);
    return data === true;
  }, [householdId]);

  // The first read. Keyed on the household alone: guides and households
  // refresh on their own schedule in DataContext, and re-asking has_crown
  // every time they do would be a request per refresh for an answer that only
  // changes on purchase. Focus is the other trigger — see the focus effect
  // below; this one exists so the first paint already knows which side of the
  // paywall it is on, and it owns `checking` (the focus read must not).
  useEffect(() => {
    if (!householdId) return;
    let cancelled = false;

    setChecking(true);
    setCheckFailed(false);
    (async () => {
      try {
        const active = await checkEntitlement();
        if (!cancelled) setHasCrown(active);
      } catch {
        // A failed read is NOT a "you haven't paid" — leave hasCrown alone and
        // let the user retry, rather than showing a buy button to someone who
        // already owns Crown.
        if (!cancelled) setCheckFailed(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [householdId, checkEntitlement]);

  // Re-read on focus, the way AICheatSheet, PDFPreview and Settings all do.
  // The read above is keyed to [householdId, checkEntitlement], so it fires
  // once per mount and never again — yet Crown can arrive while this screen
  // just sits in the stack: another household member buys it on their device,
  // or the buyer comes back from the system browser.
  //
  // That last case is the whole game on NATIVE. create-checkout-session's
  // return URL is an https://pawstructions.com address, and app.json declares
  // no iOS associatedDomains and no Android intentFilters, so Stripe's
  // redirect lands in the system browser and `checkout=success` can never
  // reach this screen — which also means the auto-poll below never arms.
  // Coming back to the app is the only signal we get, so this is it.
  //
  // Does NOT touch `checking`: that flag drives the Refresh button's spinner
  // and the first-paint gate, and a silent background read flipping it would
  // grey out the buttons under the user's finger.
  useFocusEffect(
    useCallback(() => {
      if (!householdId) return;
      let cancelled = false;
      (async () => {
        try {
          const active = await checkEntitlement();
          if (cancelled || active === null) return;
          setHasCrown(active);
          // A read that got a real answer retires an earlier failed one.
          setCheckFailed(false);
        } catch {
          // Same rule as the first read: a read that threw says NOTHING about
          // entitlement, so it must not write hasCrown in either direction.
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [householdId, checkEntitlement])
  );

  // Retire the stored record once it can no longer mean "a payment might be in
  // flight": has_crown says the purchase landed, or Stripe returned the buyer
  // through the cancel URL and that return has not been spent yet. Only this
  // household's entry is touched, so confirming Crown on one household can't
  // discard a checkout started for another.
  useEffect(() => {
    if (householdId == null || pendingCheckouts?.[householdId] === undefined) return;
    if (hasCrown !== true && !cancelledReturn) return;
    setPendingCheckouts((prev) => withoutHousehold(prev, householdId));
    void clearPendingCheckout(householdId);
  }, [pendingCheckouts, householdId, hasCrown, cancelledReturn]);

  // Auto-poll has_crown after a successful return from Stripe so the common
  // case — webhook lands a second or two after the buyer does — resolves
  // itself with no tap at all. See WEBHOOK_POLL_DELAYS_MS for the bound.
  //
  // Depends on `crownConfirmed`, not on `hasCrown`: a poll tick that reads a
  // real false writes hasCrown, and depending on the raw value would tear this
  // effect down and restart the chain from attempt zero — an unbounded poll
  // wearing a bounded one's clothes.
  const crownConfirmed = hasCrown === true;
  useEffect(() => {
    if (checkoutReturn !== 'success' || !householdId || crownConfirmed) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const attempt = (i: number) => {
      if (i >= WEBHOOK_POLL_DELAYS_MS.length) {
        if (!cancelled) setPollExhausted(true);
        return;
      }
      timer = setTimeout(async () => {
        if (cancelled) return;
        try {
          const active = await checkEntitlement();
          if (cancelled) return;
          if (active === true) {
            setHasCrown(true);
            return;
          }
          if (active === false) {
            setHasCrown(false);
            // A tick that got a real answer retires an earlier failed read —
            // otherwise the "couldn't check" card would sit under a banner
            // that says we just did.
            setCheckFailed(false);
          }
        } catch {
          // Same honesty rule as the initial read: a failed poll says nothing
          // about entitlement, so leave hasCrown alone and just try again.
        }
        if (!cancelled) attempt(i + 1);
      }, WEBHOOK_POLL_DELAYS_MS[i]);
    };

    attempt(0);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [checkoutReturn, householdId, crownConfirmed, checkEntitlement]);

  // Nothing left in flight that could still produce a household: stop waiting
  // so the retry card can replace the spinner. (`checking` starts true so the
  // first paint doesn't flash a buy button before the entitlement is known.)
  useEffect(() => {
    if (!householdId && !resolvingGuide && !householdsLoading && !loadingGuides) {
      setChecking(false);
    }
  }, [householdId, resolvingGuide, householdsLoading, loadingGuides]);

  // Web only. handleCheckout deliberately leaves `starting` true after
  // window.location.assign, on the theory that the document is on its way out.
  // It is not always: a back-navigation from Stripe can restore THIS document
  // from the bfcache with the JS heap intact — `starting` still true, the
  // purchase button stuck in its spinner with nothing left to clear it.
  // `event.persisted` is exactly that restore, and only that.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setStarting(false);
    };
    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  const handleRefresh = async () => {
    setChecking(true);
    setCheckFailed(false);
    try {
      const active = await checkEntitlement();
      setHasCrown(active);
      if (active === false) {
        // Deliberately does not say "your payment is processing" — we have no
        // idea whether a payment was made, and claiming one would be a lie to
        // someone who cancelled at the Stripe page.
        showAlert(
          'Not showing yet',
          "If you've just paid, the confirmation usually reaches us within a few seconds. Give it a moment and tap Refresh again."
        );
      }
    } catch (error: any) {
      showAlert(
        "Couldn't check",
        error?.message || 'Something went wrong checking your household. Please try again.'
      );
      setCheckFailed(true);
    } finally {
      setChecking(false);
    }
  };

  const handleCheckout = async () => {
    if (!householdId) return;
    setStarting(true);
    let recorded = false;
    try {
      const url = await dataService.createCrownCheckoutSession(householdId, guideId);
      // Persist BEFORE handing the user over, on both platforms: the web
      // redirect never comes back to this JS, and native may be backgrounded
      // the instant openURL resolves. Written only once a session actually
      // exists, so a create failure leaves nothing behind.
      const startedAt = Date.now();
      // Spend any `?checkout=cancelled` return FIRST: it described the session
      // before this one, and leaving it live would have the effect above
      // delete the record we are about to write — and keep awaitingWebhook
      // false — for as long as this screen entry lasts.
      setCancelConsumed(true);
      setPendingCheckouts((prev) => ({ ...(prev ?? {}), [householdId]: startedAt }));
      await writePendingCheckout(householdId, startedAt);
      recorded = true;
      if (Platform.OS === 'web') {
        // Full-page redirect to Stripe's hosted page. Deliberately no
        // setStarting(false): this document is on its way out, and flipping
        // the button back to "ready" during the unload invites a second tap
        // and a second checkout session. The bfcache restore — the one case
        // where the document comes BACK — is cleared by the pageshow handler.
        window.location.assign(url);
        return;
      }
      // Native opens the system browser; this screen stays mounted behind it,
      // so the button has to become tappable again.
      await Linking.openURL(url);
      setStarting(false);
    } catch (error: any) {
      setStarting(false);
      if (recorded) {
        // The browser never opened, so no payment page was ever shown and
        // nothing is in flight. Drop the record rather than hide the button
        // for fifteen minutes over a failure the user just saw an alert for.
        setPendingCheckouts((prev) => withoutHousehold(prev, householdId));
        void clearPendingCheckout(householdId);
      }
      showAlert(
        "Couldn't open checkout",
        error?.message || 'Something went wrong. Please try again.'
      );
      // One reason the function refuses is 'already_crowned' — the webhook can
      // land while this screen is open. Re-read entitlement rather than parse
      // the message, so the offer is replaced by the unlocked card either way.
      try {
        const active = await checkEntitlement();
        if (active !== null) setHasCrown(active);
      } catch {
        // The alert above already told them what happened.
      }
    }
  };

  const goToSheet = () => {
    if (guideId) {
      navigation.navigate('AICheatSheet', { guideId });
    } else {
      navigation.goBack();
    }
  };

  // Nothing to show until we know which household this is about — or, while
  // the stored records are still being read, whether this user already has a
  // payment in flight. The record read is a single storage key that cannot
  // hang (readPendingCheckouts resolves to an empty map on any failure,
  // including a throw), so this costs a frame or two, and a frame of spinner
  // beats a frame of $5 button in front of someone mid-purchase.
  if (pendingCheckouts === undefined || (!householdId && checking)) {
    return (
      <View className="flex-1 bg-cream-200">
        <StatusBar style="dark" />
        <ScreenHeader title="Unlock Crown" />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />
      <ScreenHeader title="Unlock Crown" />

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        <ScreenContainer variant="content">
          {!householdId ? (
            <Card className="items-center py-8">
              <Text className="text-5xl mb-4">🏠</Text>
              <Text className="text-xl font-semibold text-brown-800 mb-2 text-center">
                {"We couldn't tell which household to unlock"}
              </Text>
              <Text className="text-tan-500 text-center mb-4">
                Crown is bought per household, so we need to know yours first.
                Check your connection and try again.
              </Text>
              <Button title="Try Again" variant="outline" onPress={() => refreshHouseholds()} />
            </Card>
          ) : hasCrown === true ? (
            <Card className="mb-4 bg-warm-50 border-warm-300">
              <Text className="text-xl font-semibold text-brown-800 mb-2">
                👑 Crown is active
              </Text>
              <Text className="text-brown-600 mb-4">
                {`Every cheat sheet in ${householdLabel} is unlocked — no watermark on screen, and none in the PDF you hand your sitter. Nothing else to pay, ever.`}
              </Text>
              <Button
                title={guideId ? 'Back to your cheat sheet' : 'Done'}
                onPress={goToSheet}
              />
            </Card>
          ) : (
            <>
              {/* Return-from-Stripe banners. They describe where the user has
                  been, never what their bank did — has_crown is the only thing
                  that decides whether Crown is on.
                  The wording forks on hasCrown because this branch also covers
                  hasCrown === null, the value left alone when the read THREW:
                  "Crown isn't showing on this household yet" is an assertion
                  about an entitlement we never managed to read, and it would
                  flatly contradict the checkFailed card below. With null we
                  say only what we know — that we are still checking. */}
              {checkoutReturn === 'success' && (
                <Card className="mb-4 bg-warm-50 border-warm-300">
                  <Text className="text-brown-800 font-semibold mb-1">
                    Thanks — finishing up
                  </Text>
                  <Text className="text-brown-600 text-sm">
                    {pollExhausted
                      ? hasCrown === false
                        ? "Crown still isn't showing on this household. If your payment went through it will land here — tap Refresh, and if it still doesn't appear, get in touch rather than paying again."
                        : "We still haven't been able to check this household. Tap Refresh — and if that keeps failing, get in touch rather than paying again."
                      : hasCrown === false
                        ? "Crown isn't showing on this household yet. Confirmations usually reach us within a few seconds, and we're re-checking automatically — nothing for you to do."
                        : "We're checking this household now. It usually takes a few seconds, and we're re-checking automatically — Refresh is there if you'd rather not wait."}
                  </Text>
                </Card>
              )}
              {cancelledReturn && (
                <Card className="mb-4 bg-cream-100">
                  <Text className="text-brown-800 font-semibold mb-1">Checkout cancelled</Text>
                  <Text className="text-brown-600 text-sm">
                    You left before paying, so nothing was charged. The offer is
                    still here whenever you want it.
                  </Text>
                </Card>
              )}

              {checkFailed && (
                <Card className="mb-4 bg-cream-100">
                  <Text className="text-brown-800 font-semibold mb-1">
                    {"Couldn't check this household"}
                  </Text>
                  <Text className="text-brown-600 text-sm">
                    {"We couldn't confirm whether Crown is already on. If you've bought it before, tap Refresh below rather than paying again."}
                  </Text>
                </Card>
              )}

              {/* The offer */}
              <Card className={awaitingWebhook ? 'mb-8' : 'mb-4'}>
                <Text className="text-2xl font-bold text-brown-800 mb-1">
                  👑 Pawstructions Crown
                </Text>
                <View className="flex-row items-baseline gap-2 mb-1">
                  <Text className="text-3xl font-bold text-primary-600">$5</Text>
                  <Text className="text-brown-600 font-medium">one-time</Text>
                </View>
                {/* Said plainly and early: the single question a $5 button has
                    to answer is "will this bill me again?". */}
                <Text className="text-tan-500 text-sm mb-4">
                  One payment. Not a subscription — nothing renews, and there is
                  no second charge.
                </Text>

                <View className="border-t border-tan-200 pt-4 gap-3">
                  <View className="flex-row gap-3">
                    <Text className="text-warm-600">✓</Text>
                    <Text className="text-brown-600 flex-1">
                      AI cheat sheets for every guide, regenerated whenever your
                      pets&apos; details change.
                    </Text>
                  </View>
                  <View className="flex-row gap-3">
                    <Text className="text-warm-600">✓</Text>
                    <Text className="text-brown-600 flex-1">
                      No PREVIEW watermark — on screen, and in the PDF you
                      actually hand your sitter.
                    </Text>
                  </View>
                  <View className="flex-row gap-3">
                    <Text className="text-warm-600">✓</Text>
                    <Text className="text-brown-600 flex-1">
                      Shared with everyone in the household, so it only gets
                      bought once.
                    </Text>
                  </View>
                  <View className="flex-row gap-3">
                    <Text className="text-warm-600">✓</Text>
                    <Text className="text-brown-600 flex-1">
                      Yours permanently, at the founding price.
                    </Text>
                  </View>
                </View>

                {/* Crown attaches to a household, not an account. Someone in
                    two households must be able to see which one they are
                    buying BEFORE they pay, not discover it afterwards. */}
                <View className="border-t border-tan-200 mt-4 pt-3">
                  <Text className="text-tan-500 text-sm">
                    {`This unlocks ${householdLabel}.`}
                  </Text>
                </View>

                {/* The purchase path is REMOVED, not merely disabled, while a
                    checkout is in flight without a confirmed entitlement — see
                    awaitingWebhook. A greyed-out button that comes back to life
                    the moment `checking` ends is exactly the second $5 charge
                    we are avoiding. */}
                <View className="mt-4">
                  {awaitingWebhook ? (
                    <>
                      <Button
                        title="Refresh"
                        onPress={handleRefresh}
                        loading={checking}
                        disabled={checking || starting}
                      />
                      {/* Says what WE have done, not what the bank did — the
                          same rule the banners above follow. */}
                      <Text className="text-tan-500 text-xs text-center mt-3">
                        You&apos;ve already been through Stripe&apos;s payment
                        page, so the $5 button is put away until we&apos;ve
                        confirmed this household. Nothing here can start a
                        second payment.
                      </Text>
                      {/* Without a success return we are going on our own
                          record of sending them to Stripe, which cannot tell
                          "paid" from "walked away". Name the way out, so an
                          abandoned checkout is a wait and not a dead end. */}
                      {checkoutReturn !== 'success' && (
                        <Text className="text-tan-500 text-xs text-center mt-2">
                          {`If you left without paying, the $5 button comes back ${PENDING_CHECKOUT_TTL_MINUTES} minutes after you started — tap Refresh then.`}
                        </Text>
                      )}
                    </>
                  ) : (
                    <>
                      <Button
                        title="👑 Unlock Crown — $5"
                        onPress={handleCheckout}
                        loading={starting}
                        disabled={starting || checking}
                      />
                      <Text className="text-tan-500 text-xs text-center mt-3">
                        You&apos;ll finish the payment on Stripe&apos;s secure
                        page, then land back here.
                      </Text>
                    </>
                  )}
                </View>
              </Card>

              {/* The webhook can land a beat after the buyer does — this is the
                  path back for anyone who returns before it has. Hidden while
                  awaitingWebhook, where the offer card above already carries
                  Refresh as its primary action. */}
              {!awaitingWebhook && (
                <Card className="mb-8">
                  <Text className="text-brown-800 font-semibold mb-1">Already paid?</Text>
                  <Text className="text-brown-600 text-sm mb-3">
                    If you&apos;ve just finished checkout, or bought Crown on
                    another device, refresh to pick it up.
                  </Text>
                  <Button
                    title="Refresh"
                    variant="outline"
                    onPress={handleRefresh}
                    loading={checking}
                    disabled={checking || starting}
                  />
                </Card>
              )}
            </>
          )}
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
