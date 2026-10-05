import { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useData } from '../contexts';
import { Button, Card, JourneyCards, ScreenContainer } from '../components';
import { showAlert } from '../lib/showAlert';
import { showConfirm } from '../lib/dialogs';
import { formatDate, toLocalDateKey } from '../lib/dates';
import { dataService } from '../services';
import { Icon } from '../components/Icon';
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { PendingSitterInvite, SitterConnection, SitterTrip } from '../types';
import { friendlyError } from '../lib/errors';
import { isSitterClientLimitError, sitterLimitMessage } from '../lib/sitterLimit';

type Props = NativeStackScreenProps<MainStackParamList, 'SitterHome'>;

export function SitterHomeScreen({ navigation }: Props) {
  const {
    sitterConnections,
    loadingSitterConnections,
    sitterConnectionsError,
    refreshSitterConnections,
    pendingSitterInvites,
    respondToSitterInvite,
    activePets,
    pendingInvites: householdInvites,
  } = useData();
  
  const [pendingInvites, setPendingInvites] = useState<PendingSitterInvite[]>([]);
  const [activeClients, setActiveClients] = useState<SitterConnection[]>([]);
  const [loadingResponse, setLoadingResponse] = useState<string | null>(null);
  // Only for the label on the plans button. A subscriber asking "what will
  // this cost" has already answered it; they are looking for their plan.
  const [subscribed, setSubscribed] = useState(false);

  // Pending invitations come from a DIFFERENT source than active clients, and
  // this is the whole reason 0016 exists: my_sitter_connections keys on
  // sitter_user_id, which stays NULL until someone accepts, so an unaccepted
  // invitation can never appear there. Filtering connections for status
  // 'invited' — which this screen originally did — matched nothing, ever.
  useEffect(() => {
    setPendingInvites(pendingSitterInvites);
    setActiveClients(sitterConnections.filter((c) => c.status === 'active'));
  }, [sitterConnections, pendingSitterInvites]);

  useFocusEffect(
    useCallback(() => {
      void refreshSitterConnections();
      dataService
        .getMySitterPlan()
        .then((plan) => setSubscribed(plan.subscribed))
        .catch(() => {});
    }, [refreshSitterConnections])
  );

  const handleAccept = async (id: string) => {
    setLoadingResponse(id);
    try {
      const success = await respondToSitterInvite(id, true);
      if (success) {
        await refreshSitterConnections();
      } else {
        showAlert('Could not accept', 'Please try again later.');
      }
    } catch (error: any) {
      // The client limit is not a failure, it is the product. Showing it in a
      // red "could not respond" box would read as the app being broken.
      if (isSitterClientLimitError(error)) {
        const seePlans = await showConfirm({
          title: 'One more client needs a plan',
          message: sitterLimitMessage(error),
          confirmLabel: 'See plans',
          cancelLabel: 'Not now',
        });
        if (seePlans) navigation.navigate('SitterPlans');
        return;
      }
      showAlert('Could not respond', friendlyError(error, 'An unknown error occurred'));
    } finally {
      setLoadingResponse(null);
    }
  };

  const handleDecline = async (id: string) => {
    const confirmed = await showConfirm({
      title: 'Decline invitation?',
      message: 'You can be invited again later.',
      confirmLabel: 'Decline'
    });
    
    if (!confirmed) return;
    
    setLoadingResponse(id);
    try {
      const success = await respondToSitterInvite(id, false);
      if (success) {
        await refreshSitterConnections();
      } else {
        showAlert('Could not decline', 'Please try again later.');
      }
    } catch (error: any) {
      showAlert('Could not respond', friendlyError(error, 'An unknown error occurred'));
    } finally {
      setLoadingResponse(null);
    }
  };

  const renderPendingInvite = (invite: PendingSitterInvite) => (
    <Card key={invite.id} className="mb-4 bg-warm-50 border border-warm-300">
      <View className="p-4">
        <Text className="text-brown-800 font-semibold">{invite.household_name}</Text>
        {invite.invited_by_email ? (
          <Text className="text-tan-600 text-sm mt-1">
            Invited by {invite.invited_by_email}
          </Text>
        ) : null}
        <View className="flex-row justify-end mt-3 space-x-2">
          <Button
            title="Accept"
            onPress={() => handleAccept(invite.id)}
            variant="primary"
            disabled={loadingResponse === invite.id}
          />
          <Button
            title="Decline"
            onPress={() => handleDecline(invite.id)}
            variant="outline"
            disabled={loadingResponse === invite.id}
          />
        </View>
      </View>
    </Card>
  );

  const renderActiveClient = (client: SitterConnection) => {
    let accessText = 'Ongoing access';
    if (client.ends_on) {
      accessText = `Until ${formatDate(client.ends_on)}`;
    } else if (client.starts_on) {
      accessText = `From ${formatDate(client.starts_on)}`;
    }

    return (
      <Pressable
        key={client.id}
        onPress={() => navigation.navigate('SitterHousehold', {
          householdId: client.household_id,
          householdName: client.household_name
        })}
        className="mb-4"
        // Without these the whole card is an unnamed clickable region: a
        // screen reader announces the two Texts inside it and gives no hint
        // that the row goes anywhere. The label repeats the access window
        // because that is the part a sitter is checking for.
        accessibilityRole="button"
        accessibilityLabel={`${client.household_name}. ${accessText}.`}
        accessibilityHint="Opens this client's pets, guides and check-ins"
      >
        <Card>
          <View className="p-4">
            <Text className="text-lg font-semibold text-brown-800">{client.household_name}</Text>
            <Text className="text-tan-500 mt-1">{accessText}</Text>
          </View>
        </Card>
      </Pressable>
    );
  };

  const renderEmptyState = () => (
    <Card className="py-12 items-center justify-center">
      <Icon name="paw" size={48} />
      <Text className="text-xl font-semibold text-brown-800 mt-4">No clients yet</Text>
      <Text className="text-tan-500 text-center mt-2 px-4">
        When an owner invites you to care for their pets, the invitation will appear here.
      </Text>
    </Card>
  );

  const renderError = () => (
    <Card className="py-6">
      <Text className="text-center text-brown-800">{sitterConnectionsError}</Text>
      <View className="mt-4">
        <Button title="Try Again" onPress={refreshSitterConnections} variant="primary" />
      </View>
    </Card>
  );

  const renderContent = () => {
    if (loadingSitterConnections && sitterConnections.length === 0) {
      return (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      );
    }

    if (sitterConnectionsError) {
      return renderError();
    }

    if (pendingInvites.length === 0 && activeClients.length === 0) {
      return renderEmptyState();
    }

    return (
      <>
        {pendingInvites.map(renderPendingInvite)}
        {activeClients.map(renderActiveClient)}
      </>
    );
  };

  const clientCount = activeClients.length;
  // A pending invitation is not "no clients" — saying so directly above one is
  // the app arguing with itself.
  const hasAnyClient = sitterConnections.some((c) => c.status === 'active');
  const ownsPets = activePets.length > 0;

  /**
   * Today's numbers, loaded in the background.
   *
   * This screen used to be a list of clients with a button to Today. A list of
   * clients answers "who am I sitting for", which is not a question anybody has
   * at 7am; "what is still undone" is. So the number comes to the home screen
   * rather than making the sitter go and look for it.
   *
   * Loaded WITHOUT blocking: the card renders immediately and the count fills
   * in when it arrives, because assembling it costs a couple of reads per
   * client household (the tasks are derived, not stored — see lib/routineTasks)
   * and a home screen must not wait on that.
   */
  const [today, setToday] = useState<{ total: number; done: number } | null>(null);

  /**
   * Trips owners have asked this sitter to cover (0034): requests to answer,
   * and accepted trips that are still ahead or under way. Reloaded on focus,
   * like the Today count, so an answer given elsewhere shows on return.
   */
  const [trips, setTrips] = useState<SitterTrip[]>([]);
  const [answeringTrip, setAnsweringTrip] = useState<string | null>(null);
  const loadTrips = useCallback(async () => {
    try {
      setTrips(await dataService.getMySitterTrips());
    } catch {
      // Keep whatever was showing; a failed read must not empty the list.
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void loadTrips();
    }, [loadTrips, sitterConnections])
  );

  const answerTrip = async (trip: SitterTrip, accept: boolean) => {
    if (!accept) {
      const ok = await showConfirm({
        title: `Decline ${trip.title}?`,
        message: `${trip.household_name} will be told you can't take this trip.`,
        confirmLabel: 'Decline',
      });
      if (!ok) return;
    }
    setAnsweringTrip(trip.guide_id);
    try {
      await dataService.respondToTrip(trip.guide_id, accept);
      await loadTrips();
    } catch (error: any) {
      showAlert("Couldn't answer", friendlyError(error, 'Please try again.'));
    } finally {
      setAnsweringTrip(null);
    }
  };

  const tripDates = (t: SitterTrip) => {
    const fmt = (d: string | null) => (d ? formatDate(d, { weekday: 'short', month: 'short', day: 'numeric' }) : '');
    const a = fmt(t.start_date);
    const b = fmt(t.end_date);
    if (a && b) return a === b ? a : `${a} to ${b}`;
    return a || b || 'Dates not set yet';
  };
  const tripRequests = trips.filter((t) => t.sitter_status === 'requested');
  const upcomingTrips = trips.filter((t) => t.sitter_status === 'accepted');

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const groups = await dataService.getSitterToday(toLocalDateKey(new Date()));
          if (cancelled) return;
          const rows = groups.flatMap((g) => g.rows);
          setToday({ total: rows.length, done: rows.filter((r) => r.completed).length });
        } catch {
          // Silent: the card keeps its button, which still works. A failed
          // count must never render as "nothing to do today".
          if (!cancelled) setToday(null);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [sitterConnections])
  );
  const subtitle = clientCount === 0
    ? pendingInvites.length > 0
      ? pendingInvites.length === 1
        ? 'One invitation waiting'
        : `${pendingInvites.length} invitations waiting`
      : 'No clients yet'
    : clientCount === 1
      ? '1 household'
      : `${clientCount} households`;

  return (
    <View className="flex-1 bg-cream-200">
      <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
        <ScreenContainer variant="content">
          <View className="mt-4">
            {/* For a sitter with no pets this IS home, so there is nowhere to
                go back to: Home sends them straight here, and no row is spent
                on it. Someone who also keeps pets gets a way to their own side,
                named for where it goes rather than "Back". */}
            {ownsPets ? (
              <View className="flex-row mb-2">
                <Button
                  title="← My pets"
                  onPress={() => navigation.navigate('Home')}
                  variant="outline"
                />
              </View>
            ) : null}
            {/* Title left, the sitter actions and Settings right. flex-wrap drops the
                actions under the title on a phone instead of squeezing them. */}
            <View className="flex-row flex-wrap items-end justify-between" style={{ gap: 12 }}>
              <View>
                <Text className="text-2xl font-bold text-brown-800">My Clients</Text>
                <Text className="text-tan-500">{subtitle}</Text>
              </View>
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                <Button
                  title="✉️ Invite a client"
                  onPress={() => navigation.navigate('InviteClient')}
                  variant="primary"
                />
                <Button
                  title={subscribed ? 'Your sitter plan' : 'What this will cost'}
                  onPress={() => navigation.navigate('SitterPlans')}
                  variant="outline"
                />
                <Button
                  title="Settings"
                  onPress={() => navigation.navigate('Settings')}
                  variant="secondary"
                />
              </View>
            </View>
          </View>
        </ScreenContainer>
      </View>
      <ScrollView className="flex-1">
        <ScreenContainer variant="content" className="py-4">
          {/* sitter-welcome (contract C4). The sitter surface only ever offers
              that one journey — the founder checklist and the joiner tour are
              about a household of your own, which is not what a sitter has. */}
          <JourneyCards surface="sitter" />

          {/* An invitation to JOIN a household (family, not sitting). Home is
              where these are normally answered, and a sitter can reach this
              screen without passing Home, so it is surfaced here too. The
              answer itself happens on Household, which already has the whole
              accept flow, rather than in a second copy of it. */}
          {householdInvites.map((invite) => (
            <Card key={invite.id} className="mb-4 bg-primary-50 border border-primary-200">
              <Text className="text-brown-800 font-semibold mb-1">Household invitation</Text>
              <Text className="text-brown-600 mb-3">
                {`You've been invited to join ${invite.household_name}${
                  invite.invited_by_email ? ` by ${invite.invited_by_email}` : ''
                }.`}
              </Text>
              <Button
                title="Review invitation"
                onPress={() => navigation.navigate('Household')}
                variant="primary"
              />
            </Card>
          ))}

          {/* FIRST, above the clients. */}
          {hasAnyClient ? (
            <Card className="mb-4 bg-primary-50 border border-primary-200">
              <Text className="text-lg font-semibold text-brown-800 mb-1">
                {today === null
                  ? 'Today'
                  : today.total === 0
                    ? 'Nothing scheduled today'
                    : today.done === today.total
                      ? 'Everything is done today'
                      : `${today.total - today.done} still to do today`}
              </Text>
              <Text className="text-brown-700 leading-6 mb-4">
                {today === null
                  ? 'Every task due today, across all of your clients, in one list.'
                  : today.total === 0
                    ? 'None of your clients have a guide covering today. When an owner sets trip dates that include today, their routine appears here.'
                    : today.done === today.total
                      ? `All ${today.total} tasks across your clients are ticked off.`
                      : `${today.done} of ${today.total} done, across every household you look after.`}
              </Text>
              <Button
                title="Open today"
                onPress={() => navigation.navigate('SitterToday')}
                variant="primary"
              />
            </Card>
          ) : null}

          {/* Trips an owner asked this sitter to take: answer first. */}
          {tripRequests.map((t) => (
            <Card key={t.guide_id} className="mb-4 bg-warm-50 border border-warm-300">
              <Text className="text-brown-800 font-semibold">Can you take this trip?</Text>
              <Text className="text-brown-700 mt-1">
                {t.household_name}: {t.title}
              </Text>
              <Text className="text-tan-600 text-sm mb-3">{tripDates(t)}</Text>
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                <Button
                  title="Accept"
                  onPress={() => answerTrip(t, true)}
                  variant="primary"
                  disabled={answeringTrip !== null}
                  loading={answeringTrip === t.guide_id}
                />
                <Button
                  title="Decline"
                  onPress={() => answerTrip(t, false)}
                  variant="outline"
                  disabled={answeringTrip !== null}
                />
                <Button
                  title="See the guide"
                  onPress={() => navigation.navigate('GuideDetail', { guideId: t.guide_id })}
                  variant="outline"
                />
              </View>
            </Card>
          ))}

          {/* Trips they said yes to, soonest first. */}
          {upcomingTrips.length > 0 ? (
            <Card className="mb-4">
              <Text className="text-lg font-semibold text-brown-800 mb-2">Upcoming trips</Text>
              {upcomingTrips.map((t, i) => (
                <Pressable
                  key={t.guide_id}
                  onPress={() => navigation.navigate('GuideDetail', { guideId: t.guide_id })}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${t.title} for ${t.household_name}`}
                  style={{ minHeight: 48 }}
                  className={`flex-row items-center justify-between py-2 ${i > 0 ? 'border-t border-tan-100' : ''}`}
                >
                  <View className="flex-1 mr-3">
                    <Text className="text-brown-800 font-medium">{t.title}</Text>
                    <Text className="text-tan-600 text-sm">
                      {t.household_name} · {tripDates(t)}
                    </Text>
                  </View>
                  <Text className="text-tan-400 text-xl">›</Text>
                </Pressable>
              ))}
            </Card>
          ) : null}

          {/* THEN who they are. */}
          {renderContent()}

          {/* The rare sitter with animals of their own. Quiet on purpose: most
              sitters never need it, and adding a first pet is what turns on
              the owner side and the "My pets" button above. */}
          {!ownsPets ? (
            <View className="items-center mt-2 mb-8">
              <Pressable
                onPress={() => navigation.navigate('PetForm', { mode: 'create' })}
                accessibilityRole="button"
                hitSlop={12}
              >
                <Text className="text-primary-600 underline">
                  Have pets of your own? Add them
                </Text>
              </Pressable>
            </View>
          ) : null}

        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
