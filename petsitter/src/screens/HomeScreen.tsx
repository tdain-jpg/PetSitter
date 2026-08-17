import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View, Text, ScrollView, Image } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { showAlert } from '../lib/showAlert';
import { showConfirm } from '../lib/dialogs';
import { announceJoinDestination } from '../lib/inviteDestination';
import { StatusBar } from 'expo-status-bar';
import {
  Button,
  Card,
  InviteGate,
  JourneyCards,
  PetCard,
  ScreenContainer,
  SitterInviteGate,
} from '../components';
import { COLORS } from '../constants';
import { friendlyError } from '../lib/errors';

// @ts-ignore
const logo = require('../../assets/logo.png');
// @ts-ignore
const wordmark = require('../../assets/wordmark.png');
import { useAuth, useData } from '../contexts';
import { personNameFromEmail } from '../utils';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { PendingInvite, PendingSitterInvite } from '../types';

type Props = NativeStackScreenProps<MainStackParamList, 'Home'>;

// The invite RPCs raise bare lowercase strings. Map the revoked/answered
// cases to friendly copy; anything unexpected passes through sentence-cased
// with a trailing period instead of verbatim (mirrors HouseholdScreen's
// friendlyError). Empty/missing falls back.
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
    setPrimaryHousehold,
    joinedViaInvite,
    refreshHouseholds,
    refreshPets,
    refreshGuides,
    completeOnboarding,
    setJourneyState,
    setJourneyStates,
    pendingSitterInvites,
    sitterConnections,
    loadingSitterConnections,
    sitterConnectionsError,
    refreshSitterConnections,
    respondToSitterInvite,
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

  // The sitter invitation currently being accepted or declined through the
  // first-run gate, and which of the two is running. Holds the invite ROW for
  // the same reason as acceptingGateInvite above: responding refreshes the
  // pending list before settings catch up, and this snapshot keeps the gate
  // rendered (and the Onboarding replace suppressed) across that window.
  const [sitterGateResponse, setSitterGateResponse] = useState<{
    invite: PendingSitterInvite;
    accept: boolean;
  } | null>(null);

  // True once the sitter-invitation read has completed at least once. Needed
  // because loadingSitterConnections starts FALSE and nothing else on Home
  // fetches sitter data: without this, "not asked yet" is indistinguishable
  // from "asked, none waiting", and the routing effect would replace a
  // brand-new sitter into the founder wizard before their invitation arrived.
  const [sitterInvitesChecked, setSitterInvitesChecked] = useState(false);

  // A household this user belongs to but did NOT create — durable proof they
  // joined via an invite, surviving reloads and failed writes (unlike any
  // in-memory latch). Used to repair a join whose onboarding tail never
  // landed; see the routing effect.
  const joinedHousehold = useMemo(
    () => households.some((h) => h.created_by != null && h.created_by !== user?.id),
    [households, user?.id]
  );

  // An ACCEPTED sitter connection — durable proof this user came in to look
  // after somebody else's pets, surviving reloads and failed writes. Used to
  // repair a sitter accept whose onboarding tail never landed; see the routing
  // effect. Only 'active' counts: 'invited' is still just an offer, and
  // 'revoked'/'declined' are over.
  const hasActiveSitterConnection = useMemo(
    () => sitterConnections.some((c) => c.status === 'active'),
    [sitterConnections]
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

  // The first-run tail for a SITTER, shared by the gate's accept and the
  // repair below so the two can never drift apart.
  //
  // The order matches the household path, for the same reason: settle the
  // journeys BEFORE completing onboarding, so a process that dies between the
  // two leaves a recoverable un-onboarded user rather than an "onboarded
  // founder" whose founder-welcome checklist then silently auto-completes.
  // BOTH owner journeys are settled here: a sitter is not a household member,
  // so "You've joined a household" is untrue of them, and joiner-welcome would
  // otherwise become active the instant founder-welcome was skipped.
  // sitter-welcome is deliberately left unset, so it shows on SitterHome.
  const settleSitterFirstRun = useCallback(async () => {
    await setJourneyStates({
      'founder-welcome': 'skipped',
      'joiner-welcome': 'skipped',
    });
    await completeOnboarding();
  }, [setJourneyStates, completeOnboarding]);

  // Same shape as finishInterruptedJoin, for a sitter whose accept tail died
  // after the connection went active.
  const repairingSitterJoin = useRef(false);
  const finishInterruptedSitterJoin = useCallback(async () => {
    if (repairingSitterJoin.current) return;
    repairingSitterJoin.current = true;
    try {
      await settleSitterFirstRun();
      // completeOnboarding resolves even if its follow-up settings read fails
      // (loadSettings swallows), which would leave this latched while the UI
      // still believes the user is un-onboarded — a permanent spinner.
      // Verify, and unlatch so a later focus retries.
      await refreshSettings();
    } catch (err) {
      console.error('Failed to finish an interrupted sitter join:', err);
    } finally {
      repairingSitterJoin.current = false;
    }
  }, [settleSitterFirstRun, refreshSettings]);

  // Prefer a real name; otherwise derive something human from the address.
  // The email path is shared with CheckinFeed — see personNameFromEmail.
  const displayName = (() => {
    const fullName = user?.full_name?.trim();
    if (fullName) return fullName.split(' ')[0];
    return personNameFromEmail(user?.email);
  })();

  const isFocused = useIsFocused();

  // First run only: load the sitter invitations the gate needs. Nothing else
  // on Home fetches them, and DataContext does not load them at startup.
  // Scoped to an un-onboarded user so an established owner never pays for the
  // extra round trip on every focus, and re-run on focus because sessions
  // persist for days (PWA-first) — an invitation that arrives while Home sits
  // in a background tab still appears when the user comes back.
  useEffect(() => {
    if (!isFocused || loadingSettings || !settings || settings.onboarding_completed) return;
    let cancelled = false;
    // refreshSitterConnections swallows its own failure into
    // sitterConnectionsError, so "checked" means asked-and-answered, not
    // succeeded — the routing effect and the error card read the error itself.
    void refreshSitterConnections().finally(() => {
      if (!cancelled) setSitterInvitesChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isFocused, loadingSettings, settings, refreshSitterConnections]);

  // Invite-aware first run (contract C5). Replace to Onboarding ONLY after
  // the pending-invites fetch has settled with zero invites — routing while
  // invites were still loading was the observed failure: a brand-new invitee
  // got pushed into the founder pet-wizard and never saw their invite. The
  // same is true of sitter invitations, which arrive from a different RPC and
  // get the same treatment.
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

    // The same durable check for the sitter side: an ACTIVE sitter connection
    // proves this user already accepted, so their setup only needs finishing.
    // Checked after joinedHousehold, because someone who is both belongs to a
    // household first and should get that repair's journey bookkeeping.
    //
    // Skipped while the gate is mid-response: accepting turns the connection
    // active BEFORE its own tail runs, and repairing in that window would
    // duplicate the very writes that tail is making.
    if (hasActiveSitterConnection && !sitterGateResponse) {
      void finishInterruptedSitterJoin();
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
      !joinedViaInvite &&
      // Sitter invitations, same rules as household ones. "Checked" rather
      // than "not loading" because the sitter read starts un-run, not
      // in-flight; a failed read blocks routing for the same reason as above.
      sitterInvitesChecked &&
      !loadingSitterConnections &&
      !sitterConnectionsError &&
      pendingSitterInvites.length === 0 &&
      !sitterGateResponse
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
    sitterInvitesChecked,
    loadingSitterConnections,
    sitterConnectionsError,
    pendingSitterInvites,
    sitterGateResponse,
    hasActiveSitterConnection,
    finishInterruptedSitterJoin,
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

  // The sitter equivalent, on the same terms — kept mounted through the whole
  // response (sitterGateResponse) so it doesn't flicker away mid-refresh.
  // A household invite outranks a sitter invitation: membership is the
  // stronger relationship, and !showInviteGate keeps the two gates from ever
  // fighting over the screen.
  const sitterGateInvite = sitterGateResponse?.invite ?? pendingSitterInvites[0] ?? null;
  const showSitterGate =
    !showInviteGate &&
    (sitterGateResponse !== null ||
      (!loadingSettings &&
        !!settings &&
        !settings.onboarding_completed &&
        // Someone who has already joined a household, or already accepted a
        // sitter invitation, is past first run — their repair is running in
        // the routing effect and this choice is no longer theirs to make.
        !joinedViaInvite &&
        !joinedHousehold &&
        !hasActiveSitterConnection &&
        pendingSitterInvites.length > 0));
  const sitterGateExtraCount = sitterGateInvite
    ? pendingSitterInvites.filter((i) => i.id !== sitterGateInvite.id).length
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
    !showSitterGate &&
    !loadingSettings &&
    !householdsLoading &&
    !loadingSitterConnections &&
    // sitterConnectionsError blocks routing the same way householdsError does
    // — a failed sitter read cannot be told apart from "nobody invited you" —
    // so it needs the same retry card, or the user sits on a bare spinner.
    (!!householdsError || !!settingsError || !settings || !!sitterConnectionsError);

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
      const destinationId = await respondToInvite(invite.id, true);
      // Same dialog the Household screen shows: which household new pets land
      // in is the server's decision, not a property of the button tapped.
      // (Awaited inside the try so the gate stays mounted behind the dialog.)
      await announceJoinDestination({
        invite,
        destinationId,
        households,
        setPrimaryHousehold,
        formatError: friendlyInviteError,
      });
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

  const handleSitterGateAccept = async () => {
    const invite = sitterGateInvite;
    if (!invite || sitterGateResponse) return;
    setSitterGateResponse({ invite, accept: true });
    try {
      const accepted = await respondToSitterInvite(invite.id, true);
      if (!accepted) {
        // The server answers "no such connection" and "that one isn't yours"
        // with the same result, so this is as specific as we can honestly be.
        // The refreshed list drops the row, and the routing effect takes over.
        showAlert('Could not accept', 'This invitation is no longer available.');
        return;
      }
      // Only now is the user onboarded: the connection is live first, so a
      // failure here leaves an active sitter the routing effect can repair.
      await settleSitterFirstRun();
      // Land on the sitter's own home rather than the owner dashboard: they
      // have no pets of their own, and the households they came for are here.
      navigation.replace('SitterHome');
    } catch (error: any) {
      showAlert('Error', friendlyError(error, 'Could not accept the invitation.'));
    } finally {
      setSitterGateResponse(null);
    }
  };

  const handleSitterGateDecline = async () => {
    const invite = sitterGateInvite;
    if (!invite || sitterGateResponse) return;
    const confirmed = await showConfirm({
      title: 'Decline invitation?',
      message: `${invite.household_name} will not see you as their sitter. They can invite you again later.`,
      confirmLabel: 'Decline',
    });
    if (!confirmed) return;
    setSitterGateResponse({ invite, accept: false });
    try {
      await respondToSitterInvite(invite.id, false);
      // No navigation here on purpose. Declining leaves the routing effect to
      // decide, exactly as it does for the household gate: with another
      // invitation still waiting the gate offers that one instead, and only a
      // genuinely empty list sends this user into the founder wizard.
    } catch (error: any) {
      // Stay on the gate — the invitation may well still be pending, and
      // dropping the user into the founder wizard would abandon it.
      showAlert('Error', friendlyError(error, 'Could not decline the invitation.'));
    } finally {
      setSitterGateResponse(null);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error: any) {
      showAlert('Error', friendlyError(error, 'Failed to sign out'));
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

  // Takes the whole invite row, not just its id: the post-accept dialog names
  // the household the user joined, and this banner is the accept surface an
  // ESTABLISHED user (who already has a default that may win) reaches first.
  const handleInviteResponse = async (invite: PendingInvite, accept: boolean) => {
    setRespondingInvite({ id: invite.id, accept });
    try {
      // On accept the context refreshes households, pets, and guides itself,
      // so the new household's data appears without extra calls here.
      const destinationId = await respondToInvite(invite.id, accept);
      if (!accept) return;

      // Same dialog the Household screen shows — see the shared helper.
      await announceJoinDestination({
        invite,
        destinationId,
        households,
        setPrimaryHousehold,
        formatError: friendlyInviteError,
      });
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
          {/* ml-auto keeps this group pinned to the right edge even when
              flex-wrap drops it to a second line. Without it a long name
              widened the group past the row, and the wrapped line rendered
              right-aligned content inside a left-aligned block — the Settings
              button floating loose in the middle of the header. */}
          <View className="items-end shrink ml-auto">
            <Button
              title="Settings"
              onPress={navigateToSettings}
              variant="secondary"
            />
            {/* Capped and clipped to one line. This is a greeting; a long name
                is not worth reflowing the header for, and `Welcome, Bartholomew
                -Christopher!` was doing exactly that. */}
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{ fontSize: 12, color: COLORS.tan, marginTop: 4, maxWidth: 160 }}
            >
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
        ) : showSitterGate && sitterGateInvite ? (
          /* The same first run for someone invited as a SITTER: they have no
             pets to add, so the founder wizard is the wrong screen entirely. */
          <SitterInviteGate
            invite={sitterGateInvite}
            extraCount={sitterGateExtraCount}
            responding={sitterGateResponse !== null}
            respondingAccept={sitterGateResponse?.accept === true}
            onAccept={handleSitterGateAccept}
            onDecline={handleSitterGateDecline}
          />
        ) : firstRunBlockedByError ? (
          <Card className="mt-4">
            <Text className="text-brown-800 font-semibold mb-1">
              Couldn&apos;t finish setting up
            </Text>
            <Text className="text-tan-500 mb-4">
              We couldn&apos;t load your account or check whether anyone has
              invited you to their household or asked you to pet sit. Check
              your connection and try again.
            </Text>
            <Button
              title="Try Again"
              onPress={() => {
                refreshHouseholds();
                refreshSettings();
                refreshSitterConnections();
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
                    onPress={() => handleInviteResponse(invite, true)}
                    loading={isResponding && respondingInvite?.accept === true}
                    disabled={isResponding}
                  />
                </View>
                <View className="flex-1">
                  <Button
                    title="Decline"
                    variant="outline"
                    onPress={() => handleInviteResponse(invite, false)}
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
            {/* A sitter who also keeps pets of their own lands on this Home,
                and their clients were two taps away behind Settings with
                nothing here pointing at them. Only shown when there is
                actually something to open, so an owner who has never sat for
                anyone never sees it. */}
            {(hasActiveSitterConnection || pendingSitterInvites.length > 0) && (
              <Button
                title="🐾 My Clients"
                onPress={() => navigation.navigate('SitterHome')}
                variant="outline"
              />
            )}
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
