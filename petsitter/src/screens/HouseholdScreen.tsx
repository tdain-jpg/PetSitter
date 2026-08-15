import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, Input, ScreenContainer, ScreenHeader } from '../components';
import { useAuth, useData } from '../contexts';
import { showAlert, showConfirm } from '../lib/dialogs';
import { formatDate } from '../lib/dates';
import { COLORS } from '../constants';
import type { Household, HouseholdInviteRow, HouseholdMember, PendingInvite } from '../types';

// The household RPCs raise bare lowercase strings (e.g. 'invalid email').
// Map the known ones to friendly copy; anything unexpected passes through
// sentence-cased with a trailing period. Empty/missing falls back.
function friendlyRpcError(raw: unknown, fallback: string): string {
  const message = typeof raw === 'string' ? raw.trim() : '';
  if (!message) return fallback;
  switch (message.toLowerCase()) {
    case 'invalid email':
      return "That doesn't look like an email address.";
    case 'that email already belongs to a household member':
      return 'That person is already in your household.';
    case 'not a member of this household':
      return 'You are no longer a member of this household.';
    case 'invite is not pending':
    case 'invite not found':
      return 'This invitation is no longer available.';
    default: {
      const sentence = message.charAt(0).toUpperCase() + message.slice(1);
      return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
    }
  }
}

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
          showAlert('Error', error?.message || 'Could not load household details.');
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
        friendlyRpcError(error?.message, 'Something went wrong. Please try again.')
      );
    } finally {
      setSavingName(false);
    }
  };

  const handleInvite = async (household: Household) => {
    const email = (inviteDrafts[household.id] ?? '').trim();
    if (!email) {
      showAlert('Could not invite', 'Enter an email address to invite.');
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
        friendlyRpcError(error?.message, 'Something went wrong. Please try again.')
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
      await respondToInvite(invite.id, accept);
    } catch (error: any) {
      showAlert(
        'Error',
        friendlyRpcError(error?.message, 'Could not respond to the invitation.')
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
          friendlyRpcError(error?.message, 'Something went wrong. Please try again.')
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
      showAlert('Error', friendlyRpcError(error?.message, 'Could not revoke the invite.'));
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
      showAlert('Error', friendlyRpcError(error?.message, 'Could not remove this member.'));
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
      showAlert('Error', friendlyRpcError(error?.message, 'Could not leave this household.'));
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
          <View className="flex-row justify-between items-center">
            <Text className="text-xl font-bold text-brown-800 flex-1 mr-3">
              {household.name}
            </Text>
            {isOwner && (
              <Pressable
                onPress={() => startRename(household)}
                accessibilityRole="button"
                accessibilityLabel={`Rename ${household.name}`}
                className="bg-primary-50 px-3 py-1.5 rounded"
              >
                <Text className="text-primary-600 text-sm font-medium">Rename</Text>
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
          <Text className="text-base font-semibold text-brown-800 mb-2">Invite someone</Text>
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
            households.map(renderHousehold)
          )}
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
