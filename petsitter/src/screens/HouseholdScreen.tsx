import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, Input, ScreenContainer, ScreenHeader } from '../components';
import { useAuth, useData } from '../contexts';
import { isValidEmail } from '../utils';
import { showAlert, showConfirm } from '../lib/dialogs';
import { announceJoinDestination } from '../lib/inviteDestination';
import { SitterSection } from '../components/SitterSection';
import { CheckinFeed } from '../components/CheckinFeed';
import { formatDate } from '../lib/dates';
import { COLORS } from '../constants';
import type { Household, HouseholdInviteRow, HouseholdMember, PendingInvite } from '../types';
import { friendlyError } from '../lib/errors';

/**
 * HouseholdScreen — manage the household(s) the signed-in user belongs to.
 *
 * Merged-view model: all households' pets and guides are shown together in the
 * app, so this screen is purely about membership — renaming (owners), the
 * member list (remove/leave), and pending email invites (send/revoke).
 */
export function HouseholdScreen() {
  const { user } = useAuth();
  const {
    households,
    householdsLoading,
    householdsError,
    refreshHouseholds,
    pendingInvites,
    primaryHouseholdId,
    setPrimaryHousehold,
    respondToInvite,
    inviteToHousehold,
    revokeInvite,
    leaveHousehold,
    removeHouseholdMember,
    renameHousehold,
    getHouseholdMembers,
    getHouseholdInvites,
  } = useData();

  const [membersByHousehold, setMembersByHousehold] = useState<Record<string, HouseholdMember[]>>(
    {}
  );
  const [invitesByHousehold, setInvitesByHousehold] = useState<
    Record<string, HouseholdInviteRow[]>
  >({});
  const [loadingDetails, setLoadingDetails] = useState(true);

  // Inline rename (one household at a time)
  const [editingHouseholdId, setEditingHouseholdId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  // Invite composer (one draft per household)
  const [inviteDrafts, setInviteDrafts] = useState<Record<string, string>>({});
  const [invitingHouseholdId, setInvitingHouseholdId] = useState<string | null>(null);

  // Household currently being promoted to default (one at a time — every
  // "Make default" button is disabled while one is in flight, since they all
  // write the same single pointer).
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);

  // Invite addressed to ME currently being answered (disables that card's buttons)
  const [respondingInvite, setRespondingInvite] = useState<{
    id: string;
    accept: boolean;
  } | null>(null);

  // Sent invites currently being resent (revoke + re-invite under the hood).
  // A Set, not a single id: two rows' resends can overlap, and each row must
  // stay disabled until ITS list reload lands — otherwise the stale revoked
  // row could be re-tapped mid-flight.
  const [resendingInviteIds, setResendingInviteIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    if (households.length === 0) {
      setMembersByHousehold({});
      setInvitesByHousehold({});
      setLoadingDetails(false);
      return;
    }

    setLoadingDetails(true);
    (async () => {
      try {
        const results = await Promise.all(
          households.map(async (household) => {
            const [members, invites] = await Promise.all([
              getHouseholdMembers(household.id),
              getHouseholdInvites(household.id),
            ]);
            return { id: household.id, members, invites };
          })
        );
        if (cancelled) return;
        const nextMembers: Record<string, HouseholdMember[]> = {};
        const nextInvites: Record<string, HouseholdInviteRow[]> = {};
        for (const result of results) {
          nextMembers[result.id] = result.members;
          nextInvites[result.id] = result.invites;
        }
        setMembersByHousehold(nextMembers);
        setInvitesByHousehold(nextInvites);
      } catch (error: any) {
        if (!cancelled) {
          showAlert('Error', friendlyError(error, 'Could not load household details.'));
        }
      } finally {
        if (!cancelled) setLoadingDetails(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // The fetchers are recreated on provider renders; keying on the household
    // list alone avoids refetch loops while still reloading after join/leave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [households]);

  const reloadMembers = async (householdId: string) => {
    const members = await getHouseholdMembers(householdId);
    setMembersByHousehold((prev) => ({ ...prev, [householdId]: members }));
  };

  const reloadInvites = async (householdId: string) => {
    const invites = await getHouseholdInvites(householdId);
    setInvitesByHousehold((prev) => ({ ...prev, [householdId]: invites }));
  };

  const startRename = (household: Household) => {
    setEditingHouseholdId(household.id);
    setNameDraft(household.name);
  };

  const handleSaveName = async (household: Household) => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      showAlert('Could not rename', 'Household name cannot be empty.');
      return;
    }
    setSavingName(true);
    try {
      await renameHousehold(household.id, trimmed);
      setEditingHouseholdId(null);
    } catch (error: any) {
      showAlert(
        'Could not rename',
        friendlyError(error?.message, 'Something went wrong. Please try again.')
      );
    } finally {
      setSavingName(false);
    }
  };

  const handleMakeDefault = async (household: Household) => {
    setSettingDefaultId(household.id);
    try {
      // The context writes the pointer and then re-reads the primary
      // household from the server, so the badge only moves once it's real.
      await setPrimaryHousehold(household.id);
    } catch (error: any) {
      // An error here does NOT prove the change didn't happen. The write can
      // land and only its RESPONSE be lost — a gateway timeout, a flaky
      // connection — which QA reproduced by returning a synthetic 500 after
      // letting the PATCH through. Asserting "could not change default" there
      // tells the user the exact opposite of the truth, and they only find out
      // on the next reload. So reconcile the badge from the server first, then
      // say only what we actually know.
      await refreshHouseholds();
      showAlert(
        "Couldn't confirm the change",
        `${friendlyError(error?.message, 'Something went wrong.')} ` +
          'The Default badge now shows where things actually stand — check it before trying again.'
      );
    } finally {
      setSettingDefaultId(null);
    }
  };

  const handleInvite = async (household: Household) => {
    const email = (inviteDrafts[household.id] ?? '').trim();
    if (!email) {
      showAlert('Could not invite', 'Enter an email address to invite.');
      return;
    }
    // The server's shape check is a backstop, not a spellchecker. Something
    // like "a@b" satisfied it, so the invite row was written and the email was
    // dispatched to an address that can never receive it — a pending
    // invitation that will sit there forever looking like it's on its way.
    if (!isValidEmail(email)) {
      showAlert('Could not invite', `"${email}" doesn't look like an email address.`);
      return;
    }
    setInvitingHouseholdId(household.id);
    try {
      await inviteToHousehold(household.id, email);
      setInviteDrafts((prev) => ({ ...prev, [household.id]: '' }));
      await reloadInvites(household.id);
      // No unconditional delivery claim: the server silently skips the email
      // past the 5-per-recipient-per-day cap, and the in-app invitation is
      // the part we can actually promise.
      showAlert(
        'Invite sent',
        `We've emailed ${email} an invitation — they'll also see it in the app when they sign in.`
      );
    } catch (error: any) {
      showAlert(
        'Could not invite',
        friendlyError(error?.message, 'Something went wrong. Please try again.')
      );
    } finally {
      setInvitingHouseholdId(null);
    }
  };

  const handleInviteResponse = async (invite: PendingInvite, accept: boolean) => {
    setRespondingInvite({ id: invite.id, accept });
    try {
      // The context owns the whole join: the RPC, the data refreshes, and —
      // for an un-onboarded invitee who reached this screen through the
      // invite gate's live Home header — the first-run tail that records the
      // joiner marker and completes onboarding. It also latches
      // joinedViaInvite, so Home can't route this user into the founder
      // wizard even if they navigate back while that tail is still running.
      //
      // It resolves with the household new pets and guides will land in from
      // now on. That is NOT always the one just joined — the server keeps the
      // joiner's own default when it already holds pets or guides (migration
      // 0011) — and getting that wrong silently is the whole bug this round
      // fixes, so the user is told either way.
      const destinationId = await respondToInvite(invite.id, accept);
      if (!accept) return;

      // Shared with Home's two accept surfaces: the same invite must produce
      // the same dialog wherever it was accepted from. It swallows its own
      // "could not change default" failure, so the catch below stays about
      // the invite itself.
      await announceJoinDestination({
        invite,
        destinationId,
        households,
        setPrimaryHousehold,
        formatError: friendlyError,
      });
    } catch (error: any) {
      showAlert(
        'Error',
        friendlyError(error?.message, 'Could not respond to the invitation.')
      );
    } finally {
      setRespondingInvite(null);
    }
  };

  const handleResend = async (invite: HouseholdInviteRow) => {
    const confirmed = await showConfirm({
      title: 'Resend Invite?',
      message: `This sends a fresh invitation email to ${invite.email}. Each person can receive at most 5 invite emails per day.`,
      confirmLabel: 'Resend',
    });
    if (!confirmed) return;

    setResendingInviteIds((prev) => new Set(prev).add(invite.id));
    let revoked = false;
    try {
      // The invite email is deduped per invite id, so a plain repeat invite
      // would never email again — revoking and re-inviting really does.
      await revokeInvite(invite.id);
      revoked = true;
      await inviteToHousehold(invite.household_id, invite.email);
      // No delivery claim: the server silently skips the email at the
      // 5-per-recipient-per-day cap while the invite itself still succeeds.
      showAlert('Invite resent', `A fresh invitation was created for ${invite.email}.`);
    } catch (error: any) {
      if (revoked) {
        // The old invite is gone but the replacement never went out. Generic
        // "try again" copy would point at a Resend button the reload below is
        // about to remove — tell the user what actually happened instead.
        showAlert(
          'Invite cancelled, not resent',
          `The old invitation to ${invite.email} was cancelled, but the new one could not be sent. Invite them again from the email box above.`
        );
      } else {
        showAlert(
          'Could not resend',
          friendlyError(error?.message, 'Something went wrong. Please try again.')
        );
      }
    } finally {
      // Refresh regardless of outcome: if the re-invite failed after the
      // revoke succeeded, the list must stop showing the revoked invite.
      try {
        await reloadInvites(invite.household_id);
      } catch {
        // A stale list isn't worth stacking a second alert on the first.
      }
      // Only NOW re-enable this row: clearing before the reload landed left a
      // window where the stale (already-revoked) row could be re-tapped.
      setResendingInviteIds((prev) => {
        const next = new Set(prev);
        next.delete(invite.id);
        return next;
      });
    }
  };

  const handleRevoke = async (invite: HouseholdInviteRow) => {
    const confirmed = await showConfirm({
      title: 'Revoke Invite?',
      message: `The invitation to ${invite.email} will no longer be usable.`,
      confirmLabel: 'Revoke',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await revokeInvite(invite.id);
      await reloadInvites(invite.household_id);
    } catch (error: any) {
      showAlert('Error', friendlyError(error?.message, 'Could not revoke the invite.'));
    }
  };

  const handleRemoveMember = async (household: Household, member: HouseholdMember) => {
    const confirmed = await showConfirm({
      title: 'Remove Member?',
      message: `They will lose access to the pets and guides shared in ${household.name}.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await removeHouseholdMember(household.id, member.user_id);
      await reloadMembers(household.id);
    } catch (error: any) {
      showAlert('Error', friendlyError(error?.message, 'Could not remove this member.'));
    }
  };

  const handleLeave = async (household: Household) => {
    const confirmed = await showConfirm({
      title: `Leave ${household.name}?`,
      message: 'You will lose access to the pets and guides shared in this household.',
      confirmLabel: 'Leave',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      // The context refreshes households, pets, and guides after leaving.
      await leaveHousehold(household.id);
    } catch (error: any) {
      showAlert('Error', friendlyError(error?.message, 'Could not leave this household.'));
    }
  };

  const renderMemberRow = (
    household: Household,
    member: HouseholdMember,
    isOwner: boolean,
    onlyOwner: boolean,
    isLast: boolean
  ) => {
    const isMe = member.user_id === user?.id;
    const joined = formatDate(member.created_at?.slice(0, 10));

    return (
      <View
        key={member.user_id}
        className={`py-3 ${isLast ? '' : 'border-b border-tan-200'}`}
      >
        <View className="flex-row justify-between items-center">
          <View className="flex-1 mr-3">
            <View className="flex-row items-center gap-2 flex-wrap">
              <Text className="text-brown-800 font-medium">
                {isMe ? 'You' : 'Household member'}
              </Text>
              <View
                className={`px-2 py-0.5 rounded-full ${
                  member.role === 'owner' ? 'bg-primary-100' : 'bg-cream-200'
                }`}
              >
                <Text
                  className={`text-xs font-medium ${
                    member.role === 'owner' ? 'text-primary-700' : 'text-brown-600'
                  }`}
                >
                  {member.role === 'owner' ? 'Owner' : 'Member'}
                </Text>
              </View>
            </View>
            {joined ? (
              <Text className="text-tan-500 text-sm mt-1">Joined {joined}</Text>
            ) : null}
          </View>

          {isOwner && !isMe && (
            <Button
              title="Remove"
              variant="danger"
              onPress={() => handleRemoveMember(household, member)}
            />
          )}
          {isMe && !onlyOwner && (
            <Button title="Leave" variant="outline" onPress={() => handleLeave(household)} />
          )}
        </View>

        {isMe && onlyOwner && (
          <Text className="text-tan-500 text-xs mt-2">
            {"As the only owner, you can't leave this household."}
          </Text>
        )}
      </View>
    );
  };

  const renderHousehold = (household: Household) => {
    const members = membersByHousehold[household.id] ?? [];
    const invites = (invitesByHousehold[household.id] ?? []).filter(
      (invite) => invite.status === 'pending'
    );
    const myRow = members.find((member) => member.user_id === user?.id);
    const isOwner = myRow?.role === 'owner';
    const ownerCount = members.filter((member) => member.role === 'owner').length;
    const onlyOwner = isOwner && ownerCount === 1;
    const isEditing = editingHouseholdId === household.id;
    const isInviting = invitingHouseholdId === household.id;
    const isDefault = household.id === primaryHouseholdId;
    const isMakingDefault = settingDefaultId === household.id;

    return (
      <Card key={household.id} className="mb-4">
        {/* Name + inline rename (owner only) */}
        {isEditing ? (
          <View>
            <Input
              label="Household name"
              placeholder="Household name"
              value={nameDraft}
              onChangeText={setNameDraft}
              autoCapitalize="words"
            />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button
                  title="Save"
                  onPress={() => handleSaveName(household)}
                  loading={savingName}
                  disabled={savingName}
                />
              </View>
              <View className="flex-1">
                <Button
                  title="Cancel"
                  variant="outline"
                  onPress={() => setEditingHouseholdId(null)}
                  disabled={savingName}
                />
              </View>
            </View>
          </View>
        ) : (
          <View>
            <View className="flex-row justify-between items-center">
              <View className="flex-1 mr-3 flex-row items-center gap-2 flex-wrap">
                {/* shrink + minWidth:0 so a long name still wraps instead of
                    pushing the badge (and Rename) off the card. */}
                <Text className="text-xl font-bold text-brown-800 shrink" style={{ minWidth: 0 }}>
                  {household.name}
                </Text>
                {isDefault && (
                  // "Default household", not "Default for new pets": new pets
                  // and guides are only part of what this pointer decides — it
                  // is also what Settings backs up, what Import replaces, and
                  // what Clear All Data wipes. A label naming one consequence
                  // reads as a promise that it is the ONLY one. The sentence
                  // above the list spells the scope out.
                  <View className="bg-primary-100 px-2 py-0.5 rounded-full">
                    <Text className="text-primary-700 text-xs font-medium">
                      Default household
                    </Text>
                  </View>
                )}
              </View>
              {isOwner && (
                <Pressable
                  onPress={() => startRename(household)}
                  accessibilityRole="button"
                  accessibilityLabel={`Rename ${household.name}`}
                  style={{ minHeight: 44, justifyContent: 'center' }}
                  className="bg-primary-50 px-3 py-1.5 rounded"
                >
                  <Text className="text-primary-600 text-sm font-medium">Rename</Text>
                </Pressable>
              )}
            </View>

            {/* Which household is the default — for new pets and guides, and
                for Backup / Import / Clear All Data in Settings. Only offered
                on the cards that aren't already the default. The accessibility
                label starts with the VISIBLE text so voice control ("tap make
                default") still matches, then names the household the sighted
                user reads from the card above it. */}
            {!isDefault && (
              <Pressable
                onPress={() => handleMakeDefault(household)}
                disabled={settingDefaultId !== null}
                accessibilityRole="button"
                accessibilityLabel={`Make default: ${household.name}`}
                accessibilityState={{
                  disabled: settingDefaultId !== null,
                  busy: isMakingDefault,
                }}
                className="bg-primary-50 px-3 py-1.5 rounded self-start mt-2 items-center justify-center"
                // minWidth holds the label's footprint while the spinner is
                // swapped in, so the chip doesn't collapse to a square and
                // shove the surrounding rows around mid-request.
                style={{ opacity: settingDefaultId !== null ? 0.5 : 1, minWidth: 96 }}
              >
                {isMakingDefault ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <Text className="text-primary-600 text-sm font-medium">Make default</Text>
                )}
              </Pressable>
            )}
          </View>
        )}

        {/* Members */}
        <Text className="text-base font-semibold text-brown-800 mt-4">Members</Text>
        {members.length === 0 && loadingDetails ? (
          <View className="py-4 items-center">
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <View>
            {members.map((member, index) =>
              renderMemberRow(household, member, isOwner, onlyOwner, index === members.length - 1)
            )}
          </View>
        )}

        {/* Invites */}
        <View className="mt-4 pt-4 border-t border-tan-200">
          {/* Named, because a user in two households sees two of these
              composers and must never wonder which one they're filling in. */}
          <Text className="text-base font-semibold text-brown-800 mb-2">
            {`Invite someone to ${household.name}`}
          </Text>
          <Input
            label="Email address"
            placeholder="name@example.com"
            value={inviteDrafts[household.id] ?? ''}
            onChangeText={(text) =>
              setInviteDrafts((prev) => ({ ...prev, [household.id]: text }))
            }
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <Button
            title="Send Invite"
            onPress={() => handleInvite(household)}
            loading={isInviting}
            disabled={isInviting}
          />

          {invites.length > 0 && (
            <View className="mt-4">
              <Text className="text-brown-600 font-medium mb-1">Pending invites</Text>
              {invites.map((invite, index) => {
                const sent = formatDate(invite.created_at?.slice(0, 10));
                const isResending = resendingInviteIds.has(invite.id);
                return (
                  <View
                    key={invite.id}
                    className={`py-3 ${
                      index === invites.length - 1 ? '' : 'border-b border-tan-200'
                    }`}
                  >
                    <View className="mb-3">
                      <Text className="text-brown-800">{invite.email}</Text>
                      <Text className="text-tan-500 text-sm">
                        {sent ? `Invited ${sent}` : 'Pending'}
                      </Text>
                    </View>
                    <View className="flex-row gap-3">
                      <View className="flex-1">
                        <Button
                          title="Resend"
                          variant="outline"
                          onPress={() => handleResend(invite)}
                          loading={isResending}
                          disabled={isResending}
                        />
                      </View>
                      <View className="flex-1">
                        <Button
                          title="Revoke"
                          variant="outline"
                          onPress={() => handleRevoke(invite)}
                          disabled={isResending}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

        {/* Sitters are NOT members: they read this household's pets and guides
            and tick tasks, and can change nothing. Kept in its own section so
            the distinction is visible where the owner grants it. */}
        <SitterSection householdId={household.id} isOwner={isOwner} />

        {/* The owner's side of the same feed. Members can post too: a household
            with two people usually has one travelling and one at home, and the
            one at home has exactly the same thing to say. */}
        <CheckinFeed householdId={household.id} canPost />
        </View>
      </Card>
    );
  };

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      <ScreenHeader title="Household" />

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        <ScreenContainer variant="content">
          {/* Explain box */}
          <Card className="bg-cream-100 mb-4">
            {/* Explicit NBSP: a plain JSX space after the emoji rendered flush (QA). */}
            <Text className="text-brown-800 font-medium mb-1">{'🏠\u00A0One home for your pets'}</Text>
            <Text className="text-brown-600 text-sm">
              Everyone in your household shares all pets and guides. Invite your partner or
              family so you can keep care instructions up to date together.
            </Text>
          </Card>

          {/* Invites addressed to the signed-in user — mirrors the Home banner
              so invitations are findable here too. Hidden when there are none. */}
          {pendingInvites.length > 0 && (
            <View className="mb-4">
              <Text className="text-lg font-semibold text-brown-800 mb-2">
                Invites for you
              </Text>
              {pendingInvites.map((invite) => {
                const isResponding = respondingInvite?.id === invite.id;
                const invited = formatDate(invite.created_at?.slice(0, 10));
                return (
                  <Card key={invite.id} className="mb-3 bg-primary-50 border-primary-200">
                    <Text className="text-brown-800 font-semibold mb-1">
                      {invite.household_name}
                    </Text>
                    <Text className="text-brown-600 mb-3">
                      {`Invited${
                        invite.invited_by_email ? ` by ${invite.invited_by_email}` : ''
                      }${invited ? ` · ${invited}` : ''}.`}
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
            </View>
          )}

          {households.length === 0 ? (
            householdsLoading ? (
              <View className="py-8 items-center">
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : householdsError ? (
              <Card className="items-center py-8">
                <Text className="text-5xl mb-4">🏠</Text>
                <Text className="text-xl font-semibold text-brown-800 mb-2">
                  {"Couldn't load your household"}
                </Text>
                <Text className="text-tan-500 text-center mb-4">
                  Something went wrong while loading. Check your connection and try again.
                </Text>
                <Button title="Try Again" variant="outline" onPress={() => refreshHouseholds()} />
              </Card>
            ) : (
              <Card className="items-center py-8">
                <Text className="text-5xl mb-4">🏠</Text>
                <Text className="text-xl font-semibold text-brown-800 mb-2">
                  No household yet
                </Text>
                <Text className="text-tan-500 text-center mb-4">
                  {"Your household is created automatically. If it hasn't appeared yet, try refreshing."}
                </Text>
                <Button title="Refresh" variant="outline" onPress={() => refreshHouseholds()} />
              </Card>
            )
          ) : (
            <>
              {/* Said once for the whole list, not repeated on every card. The
                  last sentence is not decoration: the default household is
                  also what Settings backs up, replaces on import, and DELETES
                  under "Clear All Data".
                  Pets only — a GUIDE lands in the household of the first pet
                  you pick (GuideFormScreen), and falls back to the default just
                  when no pet is selected. The old copy claimed the default for
                  both, which is wrong whenever the selected pet lives
                  elsewhere. */}
              <Text className="text-brown-600 text-sm mb-3">
                New pets you add go to your default household, and so does a new guide unless
                you pick a pet from another one. Backup, import and Clear All Data in Settings
                apply to the default too.
              </Text>
              {households.map(renderHousehold)}
            </>
          )}
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
