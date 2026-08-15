import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View, Text, ScrollView, Image } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { showAlert } from '../lib/showAlert';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, InviteGate, JourneyCards, PetCard, ScreenContainer } from '../components';
import { COLORS } from '../constants';

// @ts-ignore
const logo = require('../../assets/logo.png');
// @ts-ignore
const wordmark = require('../../assets/wordmark.png');
import { useAuth, useData } from '../contexts';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { PendingInvite } from '../types';

type Props = NativeStackScreenProps<MainStackParamList, 'Home'>;

// The invite RPCs raise bare lowercase strings. Map the revoked/answered
// cases to friendly copy; anything unexpected passes through sentence-cased
// with a trailing period instead of verbatim (mirrors HouseholdScreen's
// friendlyRpcError). Empty/missing falls back.
function friendlyInviteError(raw: unknown, fallback: string): string {
  const message = typeof raw === 'string' ? raw.trim() : '';
  if (!message) return fallback;
  if (/invite is not pending|invite not found/i.test(message)) {
    return 'This invitation is no longer available.';
  }
  const sentence = message.charAt(0).toUpperCase() + message.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

export function HomeScreen({ navigation }: Props) {
  const { user, signOut } = useAuth();
  const {
    activePets,
    guides,
    loadingPets,
    loadingGuides,
    settings,
    loadingSettings,
    settingsError,
    refreshSettings,
    pendingInvites,
    householdsLoading,
    households,
    householdsError,
    respondToInvite,
    joinedViaInvite,
    refreshHouseholds,
    refreshPets,
    refreshGuides,
    completeOnboarding,
    setJourneyState,
  } = useData();

  // Re-check pending invites whenever Home regains focus: sessions persist for
  // days (PWA-first), so without this an already-signed-in invitee would never
  // see the invite banner until a full reload. refreshHouseholds is cheap and
  // also reloads the household list itself.
  useFocusEffect(
    useCallback(() => {
      refreshHouseholds();
      // Pets/guides too: a failed cold-start fetch otherwise sticks for the
      // whole session (nothing else retries them), and the journey cards
      // treat an errored load as unsettled — so without this they'd never
      // appear again after one bad request.
      refreshPets({ background: true });
      refreshGuides({ background: true });
    }, [refreshHouseholds, refreshPets, refreshGuides])
  );

  // Invite id currently being accepted/declined (disables that banner's buttons)
  const [respondingInvite, setRespondingInvite] = useState<{
    id: string;
    accept: boolean;
  } | null>(null);

  // Invite currently being accepted through the first-run gate. Holds the
  // invite ROW (not just a flag): the accept flow's refreshes empty
  // pendingInvites before settings flip to onboarding_completed, and this
  // snapshot keeps the gate rendered (and the Onboarding replace suppressed)
  // across that window.
  const [acceptingGateInvite, setAcceptingGateInvite] = useState<PendingInvite | null>(null);

  // A household this user belongs to but did NOT create — durable proof they
  // joined via an invite, surviving reloads and failed writes (unlike any
  // in-memory latch). Used to repair a join whose onboarding tail never
  // landed; see the routing effect.
  const joinedHousehold = useMemo(
    () => households.some((h) => h.created_by != null && h.created_by !== user?.id),
    [households, user?.id]
  );

  // Runs at most once per session: completes the setup a failed/skipped
  // invite tail left behind, then lets the normal Home render.
  const repairingJoin = useRef(false);
  const finishInterruptedJoin = useCallback(async () => {
    if (repairingJoin.current) return;
    repairingJoin.current = true;
    try {
      await setJourneyState('founder-welcome', 'skipped');
      await completeOnboarding();
      // completeOnboarding resolves even if its follow-up settings read
      // fails (loadSettings swallows), which would leave this latched while
      // the UI still believes the user is un-onboarded — a permanent
      // spinner. Verify, and unlatch so a later focus retries.
      await refreshSettings();
    } catch (err) {
      console.error('Failed to finish an interrupted join:', err);
    } finally {
      repairingJoin.current = false;
    }
  }, [setJourneyState, completeOnboarding, refreshSettings]);

  // Prefer a real name; otherwise derive something human from the address.
  // Plain email.split('@')[0] surfaces plus-addressing and dots verbatim
  // ("tcdain+qapaws", "first.last"), which reads like a bug to the user.
  const displayName = (() => {
    const fullName = user?.full_name?.trim();
    if (fullName) return fullName.split(' ')[0];
    const local = user?.email?.split('@')[0];
    if (!local) return '';
    const base = local.split('+')[0].replace(/[._-]+/g, ' ').trim();
    if (!base) return '';
    return base.charAt(0).toUpperCase() + base.slice(1);
  })();

  // Invite-aware first run (contract C5). Replace to Onboarding ONLY after
  // the pending-invites fetch has settled with zero invites — routing while
  // invites were still loading was the observed failure: a brand-new invitee
  // got pushed into the founder pet-wizard and never saw their invite.
  //
  // A FAILED invites read blocks routing entirely (it can't be told apart
  // from "no invites"): Home renders the firstRunBlockedByError retry card
  // instead, so a network blip never silently abandons an invite.
  //
  // isFocused: the gate keeps Home's header (Settings button) live, so a
  // gated user can accept their invite from Settings → Household. That accept
  // empties pendingInvites BEFORE its completeOnboarding write lands; without
  // the focus guard this effect fired in that window (Home stays mounted
  // under the pushed screen) and replaced Home with the founder wizard for a
  // user who had just JOINED a household. Deferring until Home regains focus
  // lets the accept flow finish first; useIsFocused re-runs the effect on
  // focus changes.
  const isFocused = useIsFocused();
  useEffect(() => {
    if (!isFocused || loadingSettings || !settings || settings.onboarding_completed) return;

    // Durable membership check FIRST, before anything about invites. Belonging
    // to a household you did not create proves you already joined, so the
    // setup simply needs finishing — regardless of whether OTHER invites are
    // still pending. Checking this only after `pendingInvites.length === 0`
    // left a real hole: invited to two households, accept one, tail fails,
    // relaunch — the second invite keeps the gate on screen, and its "Start
    // fresh instead" button routes an existing member into the founder wizard.
    if (joinedHousehold) {
      void finishInterruptedJoin();
      return;
    }

    if (
      !householdsLoading &&
      // A FAILED invites fetch leaves pendingInvites empty, which is
      // indistinguishable from "no invites" — routing on it would send a
      // genuinely-invited user to the founder wizard because their network
      // blipped. Wait for a clean read instead.
      !householdsError &&
      pendingInvites.length === 0 &&
      !acceptingGateInvite &&
      // Set by DataContext the instant any accept succeeds — covers accepts
      // made on other screens, whose onboarding tail may still be in flight.
      !joinedViaInvite
    ) {
      navigation.replace('Onboarding');
    }
  }, [
    isFocused,
    loadingSettings,
    settings,
    householdsLoading,
    householdsError,
    pendingInvites,
    acceptingGateInvite,
    joinedViaInvite,
    joinedHousehold,
    finishInterruptedJoin,
    navigation,
  ]);

  // Show the gate for an un-onboarded user with invites waiting; keep it
  // mounted through the whole accept flow (acceptingGateInvite) so it doesn't
  // flicker away while refreshes run.
  const gateInvite = acceptingGateInvite ?? pendingInvites[0] ?? null;
  const showInviteGate =
    acceptingGateInvite !== null ||
    (!loadingSettings &&
      !!settings &&
      !settings.onboarding_completed &&
      // Never re-offer the first-run choice to someone who already joined:
      // its "Start fresh instead" button routes to the founder wizard. Both
      // signals are needed — the in-memory latch for the current session, and
      // durable membership for a relaunch after an interrupted join (where a
      // second pending invite would otherwise bring the gate back).
      !joinedViaInvite &&
      !joinedHousehold &&
      pendingInvites.length > 0);
  const gateExtraCount = gateInvite
    ? pendingInvites.filter((i) => i.id !== gateInvite.id).length
    : 0;

  // Un-onboarded, or not yet known to be onboarded: hold back the interactive
  // dashboard. A fast tap on "Add Your First Pet" would otherwise plant a pet
  // in a not-yet-gated invitee's personal household — landing them in the
  // founder wizard, the exact bug this loop exists to kill. (Accepting from
  // the plain banner is safe now that DataContext owns the whole join, but
  // the pet-planting tap still is not.)
  //
  // "Unknown" counts as unsettled: for a brand-new signup the settings fetch
  // is the LONGEST part of first run (three sequential round trips — miss →
  // create → read — because the signup trigger makes a profile and household
  // but no settings row), while invites resolve in one.
  //
  // Scoped to `!settings` so a reload of already-loaded settings never blanks
  // the dashboard. Note import/clear DO re-enter this branch on purpose: both
  // reset onboarding_completed, so first-run rules legitimately apply again.
  const firstRunSettling =
    !showInviteGate &&
    !joinedViaInvite &&
    ((loadingSettings && !settings) ||
      // Settings failed to load: we cannot tell whether this user is
      // onboarded, so we must not render the interactive dashboard (a fast
      // tap could plant a pet before the gate ever appears).
      (!loadingSettings && !settings) ||
      (!!settings && !settings.onboarding_completed));

  // A failed invites fetch blocks the routing effect (it can't tell "no
  // invites" from "couldn't ask"), so without an escape hatch an un-onboarded
  // user would sit on a bare spinner forever. Offer a retry instead.
  const firstRunBlockedByError =
    firstRunSettling &&
    !loadingSettings &&
    !householdsLoading &&
    (!!householdsError || !!settingsError || !settings);

  const handleGateAccept = async () => {
    const invite = pendingInvites[0];
    if (!invite || acceptingGateInvite) return;
    setAcceptingGateInvite(invite);
    try {
      // respondToInvite owns the whole join: the RPC, the data refreshes, and
      // the first-run tail (record the joiner marker, then complete
      // onboarding). Keeping it there means every accept path behaves the
      // same and none can be left half-done — including accepts made from the
      // Household screen, where the user can navigate away mid-tail.
      await respondToInvite(invite.id, true);
    } catch (error: any) {
      showAlert(
        'Error',
        friendlyInviteError(error?.message, 'Could not accept the invitation.')
      );
    } finally {
      setAcceptingGateInvite(null);
    }
  };

  const handleGateStartFresh = () => {
    // NEVER auto-decline — the invite stays pending, and after the founder
    // wizard the standard Home invite banner offers it again.
    navigation.replace('Onboarding');
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to sign out');
    }
  };

  const navigateToPets = () => {
    navigation.navigate('Pets');
  };

  const navigateToGuides = () => {
    navigation.navigate('Guides');
  };

  const navigateToSettings = () => {
    navigation.navigate('Settings');
  };

  const handleInviteResponse = async (inviteId: string, accept: boolean) => {
    setRespondingInvite({ id: inviteId, accept });
    try {
      // On accept the context refreshes households, pets, and guides itself,
      // so the new household's data appears without extra calls here.
      await respondToInvite(inviteId, accept);
    } catch (error: any) {
      // Map the raw server errors for a revoked/already-answered invite to
      // friendlier copy; the context has already refreshed pendingInvites, so
      // the stale banner is gone by the time this alert shows.
      showAlert(
        'Error',
        friendlyInviteError(error?.message, 'Could not respond to the invitation.')
      );
    } finally {
      setRespondingInvite(null);
    }
  };

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
        <ScreenContainer variant="wide">
        {/* flex-wrap + shrinkable children: the fixed-size logo/wordmark row
            previously forced ~437px of intrinsic width, so a 375px phone
            rendered the header clipped with Settings off-screen. */}
        <View className="flex-row justify-between items-center flex-wrap gap-y-2">
          <View className="flex-row items-center shrink" style={{ minWidth: 0 }}>
            <Image
              source={logo}
              style={{ width: 72, height: 72, marginRight: 10 }}
              resizeMode="contain"
            />
            <View className="shrink" style={{ minWidth: 0 }}>
              <Image
                source={wordmark}
                style={{ width: 160, height: 33 }}
                resizeMode="contain"
                accessibilityLabel="Pawstructions"
              />
              <Text style={{ fontSize: 11, color: COLORS.primary, fontStyle: 'italic', marginTop: 4 }}>
                Where Pets Rule the Kingdom!
              </Text>
            </View>
          </View>
          <View className="items-end shrink">
            <Button
              title="Settings"
              onPress={navigateToSettings}
              variant="secondary"
            />
            <Text style={{ fontSize: 12, color: COLORS.tan, marginTop: 4 }}>
              Welcome{displayName ? `, ${displayName}` : ''}!
            </Text>
          </View>
        </View>
        </ScreenContainer>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        <ScreenContainer variant="wide">
        {/* First-run invite gate (contract C5): replaces the normal Home
            content so an invited newcomer chooses Accept vs Start-fresh
            instead of being routed into the founder pet-wizard. */}
        {showInviteGate && gateInvite ? (
          <InviteGate
            invite={gateInvite}
            extraCount={gateExtraCount}
            accepting={acceptingGateInvite !== null}
            onAccept={handleGateAccept}
            onStartFresh={handleGateStartFresh}
          />
        ) : firstRunBlockedByError ? (
          <Card className="mt-4">
            <Text className="text-brown-800 font-semibold mb-1">
              Couldn&apos;t finish setting up
            </Text>
            <Text className="text-tan-500 mb-4">
              We couldn&apos;t load your account or check whether anyone has
              invited you to their household. Check your connection and try
              again.
            </Text>
            <Button
              title="Try Again"
              onPress={() => {
                refreshHouseholds();
                refreshSettings();
              }}
            />
          </Card>
        ) : firstRunSettling ? (
          <View className="py-16 items-center">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
        <>
        {/* Pending household invites */}
        {pendingInvites.map((invite) => {
          const isResponding = respondingInvite?.id === invite.id;
          return (
            <Card key={invite.id} className="mb-4 bg-primary-50 border-primary-200">
              <Text className="text-brown-800 font-semibold mb-1">
                Household invitation
              </Text>
              <Text className="text-brown-600 mb-3">
                {`You've been invited to ${invite.household_name}${
                  invite.invited_by_email ? ` by ${invite.invited_by_email}` : ''
                }.`}
              </Text>
              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Button
                    title="Accept"
                    onPress={() => handleInviteResponse(invite.id, true)}
                    loading={isResponding && respondingInvite?.accept === true}
                    disabled={isResponding}
                  />
                </View>
                <View className="flex-1">
                  <Button
                    title="Decline"
                    variant="outline"
                    onPress={() => handleInviteResponse(invite.id, false)}
                    loading={isResponding && respondingInvite?.accept === false}
                    disabled={isResponding}
                  />
                </View>
              </View>
            </Card>
          );
        })}

        {/* First-run journeys (contract C4): at most one active journey card.
            Gated on onboarding_completed so a transient pre-Onboarding render
            never flashes a journey it's about to navigate away from. */}
        {settings?.onboarding_completed && <JourneyCards />}

        {/* Quick Stats */}
        <View className="flex-row gap-4 mb-6">
          <Card className="flex-1">
            <Text className="text-3xl font-bold text-primary-500">
              {loadingPets ? '...' : activePets.length}
            </Text>
            <Text className="text-tan-500">Pets</Text>
          </Card>
          <Card className="flex-1">
            <Text className="text-3xl font-bold text-primary-500">
              {loadingGuides ? '...' : guides.length}
            </Text>
            <Text className="text-tan-500">Guides</Text>
          </Card>
        </View>

        {/* Quick Actions */}
        <Card className="mb-6">
          <Text className="text-lg font-semibold text-brown-800 mb-4">
            Quick Actions
          </Text>
          <View className="gap-3">
            {activePets.length > 0 && (
              <Button
                title="✈️ Quick Trip Setup"
                onPress={() => navigation.navigate('TripWizard')}
                variant="primary"
              />
            )}
            <Button
              title="Manage Pets"
              onPress={navigateToPets}
              variant={activePets.length > 0 ? 'outline' : 'primary'}
            />
            <Button
              title="View Guides"
              onPress={navigateToGuides}
              variant="outline"
            />
            {/* Discoverable household invite: families who can't find this
                create a SECOND account and re-type the same pets. Settings →
                Household still exists for management; this is the front door. */}
            <Button
              title="💌 Invite Family"
              onPress={() => navigation.navigate('Household')}
              variant="outline"
            />
          </View>
        </Card>

        {/* Recent Pets */}
        {activePets.length > 0 && (
          <View className="mb-6">
            <View className="flex-row justify-between items-center mb-3">
              <Text className="text-lg font-semibold text-brown-800">
                Your Pets
              </Text>
              <Button
                title="See All →"
                onPress={navigateToPets}
                variant="outline"
              />
            </View>
            {activePets.slice(0, 3).map((pet) => (
              <PetCard
                key={pet.id}
                pet={pet}
                onPress={() => navigation.navigate('PetDetail', { petId: pet.id })}
              />
            ))}
          </View>
        )}

        {/* Empty State */}
        {activePets.length === 0 && !loadingPets && (
          <Card className="mb-6">
            <View className="items-center py-8">
              <Text className="text-5xl mb-4">🐾</Text>
              <Text className="text-xl font-semibold text-brown-800 mb-2">
                Get Started
              </Text>
              <Text className="text-tan-500 text-center mb-4">
                Add your first pet to start creating care guides for your pet sitters.
              </Text>
              <Button
                title="Add Your First Pet"
                onPress={() => navigation.navigate('PetForm', { mode: 'create' })}
                variant="primary"
              />
            </View>
          </Card>
        )}

        {/* Sign Out */}
        <View className="mt-4">
          <Button
            title="Sign Out"
            onPress={handleSignOut}
            variant="secondary"
          />
        </View>
        </>
        )}
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
