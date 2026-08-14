import { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, Input, ScreenContainer, ScreenHeader } from '../components';
import { useAuth, useData } from '../contexts';
import { showAlert, showConfirm } from '../lib/dialogs';
import { formatDate } from '../lib/dates';
import { COLORS } from '../constants';
import type { Household, HouseholdInviteRow, HouseholdMember } from '../types';

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
      showAlert('Invite sent', `${email} will see the invitation when they sign in.`);
    } catch (error: any) {
      showAlert(
        'Could not invite',
        friendlyRpcError(error?.message, 'Something went wrong. Please try again.')
      );
    } finally {
      setInvitingHouseholdId(null);
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
              {invites.map((invite) => {
                const sent = formatDate(invite.created_at?.slice(0, 10));
                return (
                  <View
                    key={invite.id}
                    className="flex-row justify-between items-center py-2"
                  >
                    <View className="flex-1 mr-3">
                      <Text className="text-brown-800">{invite.email}</Text>
                      <Text className="text-tan-500 text-sm">
                        {sent ? `Invited ${sent}` : 'Pending'}
                      </Text>
                    </View>
                    <Button
                      title="Revoke"
                      variant="outline"
                      onPress={() => handleRevoke(invite)}
                    />
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
