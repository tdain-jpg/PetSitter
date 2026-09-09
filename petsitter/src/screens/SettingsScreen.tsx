import { useCallback, useMemo, useState } from 'react';
import { dataService } from '../services';
import { safeGoBack } from '../lib/goBack';
import {
  View,
  Text,
  ScrollView,
  Switch,
  Platform,
  Pressable,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Card, ScreenContainer , SwitchRow } from '../components';
import { formatDate } from '../lib/dates';
import type { CrownReceipt } from '../types';
import { useAuth, useData } from '../contexts';
import { supabase } from '../lib/supabase';
import { useProfileRole } from '../hooks';
import { showAlert } from '../lib/showAlert';
import { showConfirm } from '../lib/dialogs';
import { hasPendingCrownCheckout } from './UnlockCrownScreen';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import { friendlyError } from '../lib/errors';

type Props = NativeStackScreenProps<MainStackParamList, 'Settings'>;

// The same public pages the landing page links to. They live on the ROOT stack
// (they must render for signed-out visitors), so a signed-in user would
// otherwise have to sign out to read their own refund policy.
const POLICY_LINKS = [
  { route: 'About', label: 'About Us', description: 'Who builds Pawstructions, and why' },
  { route: 'Privacy', label: 'Privacy Policy', description: 'What we store, and what never reaches the AI' },
  { route: 'Terms', label: 'Terms of Service', description: 'What we promise, and what we ask of you' },
  { route: 'Refund', label: 'Refund Policy', description: '14 days, no questions asked' },
] as const;

export function SettingsScreen({ navigation }: Props) {
  const { user, signOut } = useAuth();
  const {
    settings,
    updateSettings,
    exportAllData,
    clearAllData,
    activePets,
    deceasedPets,
    households,
    refreshPets,
    refreshGuides,
    refreshHouseholds,
    primaryHouseholdId,
    sitterConnections,
    getCrownReceipt,
    pendingSitterInvites,
  } = useData();
  // Landing preference only; RLS decides access.
  const { isSitter } = useProfileRole();


  // Crown is bought per HOUSEHOLD, so this card is about the default household
  // — the same one Data Management targets. null = no answer yet (still
  // reading, no household, or the read failed) and is deliberately distinct
  // from false: offering "Unlock — $5" to someone who has already paid is the
  // one mistake worth designing around, so an unknown answer keeps the neutral
  // wording. Read only through has_crown(h), the membership-gated RPC, never a
  // households column.
  const [crownReceipt, setCrownReceipt] = useState<CrownReceipt | null>(null);
  const [hasCrown, setHasCrown] = useState<boolean | null>(null);

  // UnlockCrown puts its $5 button away for a couple of minutes after a
  // checkout is started, so a button here reading "Unlock Crown — $5" during
  // that window sends the user to a screen with nothing to buy on it. Read the
  // same record it reads, and offer the same thing it will.
  const [checkoutPending, setCheckoutPending] = useState(false);

  // On focus, not on mount: returning from UnlockCrown after a purchase (native
  // goes back to this screen) changes nothing this component renders from, so
  // without this the card would keep offering Crown to a household that now
  // owns it. Also picks up a purchase made by another household member — and,
  // for the pending record, a checkout just started or just abandoned.
  const userId = user?.id ?? null;
  useFocusEffect(
    useCallback(() => {
      if (!primaryHouseholdId) return;
      let cancelled = false;
      (async () => {
        const { data, error } = await supabase.rpc('has_crown', { h: primaryHouseholdId });
        if (cancelled || error) return;
        setHasCrown(data === true);
        // Best-effort: a failed receipt read just hides the date, it must never
        // change whether Crown reads as active.
        try {
          const receipt = await getCrownReceipt(primaryHouseholdId);
          if (!cancelled) setCrownReceipt(receipt);
        } catch {
          /* leave the date off */
        }
      })();
      (async () => {
        const pending =
          userId != null ? await hasPendingCrownCheckout(userId, primaryHouseholdId) : false;
        if (!cancelled) setCheckoutPending(pending);
      })();
      return () => {
        cancelled = true;
      };
    }, [primaryHouseholdId, userId])
  );

  const [merging, setMerging] = useState<string | null>(null);

  /**
   * Households this user could move their things into: every one they belong to
   * except the one their things are already in. Empty for almost everybody,
   * which is why the button only appears when it is not.
   */
  const mergeTargets = useMemo(
    () => households.filter((h: { id: string }) => h.id !== primaryHouseholdId),
    [households, primaryHouseholdId]
  );

  const handleMerge = async (targetId: string, targetName: string) => {
    const confirmed = await showConfirm({
      title: `Move everything into ${targetName}?`,
      message:
        `Every pet and guide you have will move into ${targetName}, where the people already there can see and edit them. ` +
        'Nothing is deleted and nothing is copied: they move. This cannot be undone from inside the app.',
      confirmLabel: 'Move everything',
    });
    if (!confirmed) return;

    setMerging(targetId);
    try {
      const { pets, guides } = await dataService.mergeMyHouseholdInto(targetId);
      // Pets, guides and households all changed household underneath us.
      await Promise.all([refreshPets(), refreshGuides(), refreshHouseholds()]);
      showAlert(
        'Moved',
        `${pets} ${pets === 1 ? 'pet' : 'pets'} and ${guides} ${guides === 1 ? 'guide' : 'guides'} are now in ${targetName}.`
      );
    } catch (error: any) {
      showAlert("Couldn't move", friendlyError(error, 'Please try again.'));
    } finally {
      setMerging(null);
    }
  };

  // Import and Clear All Data target the DEFAULT household, whichever one that
  // is — and since migration 0011 that is often the SHARED family household,
  // not the personal one. "your household" was safe copy only while the default
  // was always the user's own: to someone who belongs to two, it reads like the
  // one literally named "My Household". Name the real target instead.
  const targetHouseholdName =
    households.find((household) => household.id === primaryHouseholdId)?.name ?? null;

  /**
   * Somebody who sits for other people and keeps no animals of their own.
   *
   * Crown unlocks the cheat sheets for a household's OWN pets. Offering it to a
   * sitter with no pets sells them nothing: there are no guides of theirs to
   * unlock, and the sheets they read belong to the people who hired them.
   *
   * PETS, not households. My first attempt tested `households.length === 0`,
   * which is unreachable — signup gives every account a primary household, so
   * that branch would never have rendered. Checked against production rather
   * than assumed: all seven users have at least one. The pet count is what
   * actually separates the two people who land on this screen, and the sitter
   * connection is what stops it catching an owner between pets.
   */
  const isSitterWithNoPets =
    activePets.length === 0 && sitterConnections.some((c) => c.status === 'active');
  const targetHousehold = targetHouseholdName ?? 'your household';

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error: any) {
      showAlert('Error', friendlyError(error, 'Failed to sign out'));
    }
  };

  const handleExport = async () => {
    try {
      const data = await exportAllData();
      const jsonString = JSON.stringify(data, null, 2);

      if (Platform.OS === 'web') {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pawstructions-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        showAlert('Export', 'Data exported. In a production app, this would save to device.');
      }
    } catch (error: any) {
      showAlert('Error', friendlyError(error, 'Failed to export data'));
    }
  };


  const handleClearData = async () => {
    const confirmed = await showConfirm({
      title: `Delete Everything in ${targetHousehold}?`,
      message:
        `This permanently deletes every pet, guide, and share link in ${targetHousehold}, ` +
        'including any that other members of it added and still use. It affects everyone ' +
        "in that household. Other households you've joined are not affected. " +
        'There is no undo: once deleted, this data cannot be recovered.',
      confirmLabel: 'Delete Everything',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await clearAllData();
      showAlert('Success', 'All data has been cleared.');
    } catch (error: any) {
      showAlert('Error', friendlyError(error, 'Failed to clear data'));
    }
  };

  const handleToggleSetting = async (key: 'auto_save_enabled' | 'notifications_enabled', value: boolean) => {
    try {
      await updateSettings({ [key]: value });
    } catch (error) {
      // Revert on error
    }
  };

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
        <ScreenContainer variant="form">
          <View className="flex-row items-center">
            <Button title="← Back" onPress={() => safeGoBack(navigation)} variant="outline" />
            <Text className="text-xl font-bold text-brown-800 ml-4">Settings</Text>
          </View>
        </ScreenContainer>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
        <ScreenContainer variant="form">
        {/* Account */}
        <Card className="mb-4">
          <Text className="text-lg font-semibold text-brown-800 mb-4">Account</Text>
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-tan-500">Email</Text>
            <Text className="text-brown-800">{user?.email}</Text>
          </View>
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-tan-500">Role</Text>
            <Text className="text-brown-800 capitalize">{user?.role}</Text>
          </View>
        </Card>

        {/* Crown: hidden from a sitter who has no household to unlock. */}
        <Card className="mb-4 bg-warm-50 border-warm-300">
          {isSitterWithNoPets ? (
            <>
              <Text className="text-lg font-semibold text-brown-800 mb-1">
                👑 Pawstructions Crown
              </Text>
              <Text className="text-brown-600 text-sm">
                Crown unlocks AI cheat sheets for a household&apos;s own pets, so
                it is bought by the owners you sit for: not by you. The guides
                they share with you are already yours to read.
              </Text>
            </>
          ) : (
          <>
          {hasCrown === true ? (
            <>
              <Text className="text-lg font-semibold text-brown-800 mb-1">
                👑 Crown is active
              </Text>
              <Text className="text-brown-600 text-sm mb-3">
                {`Every AI cheat sheet in ${targetHousehold} is unlocked: no PREVIEW watermark on screen, and none in the PDF you hand your sitter. Nothing else to pay.`}
              </Text>
              {/* Answers "did I already pay for this?", the only spend question
                  a one-time purchase raises. The date is OMITTED rather than
                  guessed when granted_at is null: grants predating migration
                  0012 have no timestamp, and inventing one would be worse than
                  saying nothing. */}
              {crownReceipt?.granted_at ? (
                <Text className="text-tan-600 text-sm mb-3">
                  {`Purchased ${formatDate(crownReceipt.granted_at.slice(0, 10), { dateStyle: 'medium' })}.`}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Text className="text-lg font-semibold text-brown-800 mb-1">
                👑 Pawstructions Crown
              </Text>
              {/* Stated the same way everywhere Crown is sold: one payment, per
                  household, no watermark. */}
              <Text className="text-brown-600 text-sm mb-3">
                AI-written cheat sheets for your sitter, with no PREVIEW
                watermark. $5 once for a whole household, not a subscription.
              </Text>
              <View className="mb-3">
                <Button
                  // No guideId: this purchase isn't tied to a sheet, and
                  // UnlockCrown falls back to the default household.
                  //
                  // Three labels for the three things that screen will
                  // actually show: a checkout of ours is still settling
                  // (Refresh and a way to start over), a household that has
                  // certainly not paid (the $5 button), or an answer we don't
                  // have yet (the offer, read-only until it does).
                  title={
                    checkoutPending
                      ? '👑 Finish unlocking Crown'
                      : hasCrown === false
                        ? '👑 Unlock Crown. $5'
                        : '👑 About Crown'
                  }
                  onPress={() => navigation.navigate('UnlockCrown')}
                />
              </View>
            </>
          )}
          </>
          )}
          <Button
            title="👀 See a Sample Cheat Sheet"
            onPress={() => navigation.navigate('SampleCheatSheet')}
            variant="outline"
          />
        </Card>

        {/* Only for people who actually sit for someone. A user with no
            connections is an owner, and showing them an empty "My Clients"
            screen would just raise a question the app then fails to answer.
            Only ACTIVE connections count: a revoked one still comes back from
            my_sitter_connections, and gating on mere presence would leave a
            former sitter a door into an empty screen.
            A PENDING invitation counts too — it comes from a different source
            (my_pending_sitter_invites, since an unaccepted row has no
            sitter_user_id), and without it a freshly invited sitter would sign
            up and find no way in at all. */}
        {/* `isSitter` is the third way in, added when sitters gained their own
            sign-up: someone who joined as a sitter but has not been invited by
            anybody yet has no connections and no pending invites, and without
            this had no route to their own clients screen or to Sitter plans —
            which is to say, no way to buy the subscription we sell them. */}
        {(isSitter ||
          sitterConnections.some((c) => c.status === 'active') ||
          pendingSitterInvites.length > 0) && (
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-brown-800 mb-1">Sitting</Text>
            <Text className="text-tan-500 text-sm mb-4">
              {pendingSitterInvites.length > 0
                ? pendingSitterInvites.length === 1
                  ? 'You have an invitation waiting.'
                  : `You have ${pendingSitterInvites.length} invitations waiting.`
                : 'The households you help care for.'}
            </Text>
            <Button
              title="🐾 My Clients"
              onPress={() => navigation.navigate('SitterHome')}
            />
            <View className="h-3" />
            <Button
              title="Sitter plans"
              onPress={() => navigation.navigate('SitterPlans')}
              variant="outline"
            />
          </Card>
        )}

        {/* Preferences */}
        <Card className="mb-4">
          <Text className="text-lg font-semibold text-brown-800 mb-4">Preferences</Text>

          <SwitchRow
            label="Auto-Save"
            description="Automatically save changes as you type"
            value={settings?.auto_save_enabled ?? true}
            onValueChange={(v) => handleToggleSetting('auto_save_enabled', v)}
            className="mb-4"
          />

          <SwitchRow
            label="Notifications"
            description="Receive reminders and updates"
            value={settings?.notifications_enabled ?? true}
            onValueChange={(v) => handleToggleSetting('notifications_enabled', v)}
          />
        </Card>

        {/* Household */}
        <Card className="mb-4">
          <Pressable
            onPress={() => navigation.navigate('Household')}
            accessibilityRole="button"
            accessibilityLabel="Manage your household"
            className="flex-row justify-between items-center"
          >
            <View className="flex-1 mr-3">
              <Text className="text-brown-800 font-medium">Household</Text>
              <Text className="text-tan-500 text-sm">
                Share pets and guides with family, and invite members
              </Text>
            </View>
            <Text className="text-tan-400 text-xl">›</Text>
          </Pressable>
        </Card>

        {/* Memorial */}
        {deceasedPets.length > 0 && (
          <Card className="mb-4">
            <Pressable
              onPress={() => (navigation as any).navigate('Memorial')}
              accessibilityRole="button"
              accessibilityLabel="Open pet memorial"
              className="flex-row justify-between items-center"
            >
              <View>
                <Text className="text-brown-800 font-medium">Pet Memorial</Text>
                <Text className="text-tan-500 text-sm">
                  {deceasedPets.length} {deceasedPets.length === 1 ? 'pet' : 'pets'} in memorial
                </Text>
              </View>
              <Text className="text-tan-400 text-xl">›</Text>
            </Pressable>
          </Card>
        )}

        {/* Data Management */}
        <Card className="mb-4">
          <Text className="text-lg font-semibold text-brown-800 mb-1">Data Management</Text>
          {/* Named before the tap, not only in the confirm dialog. */}
          <Text className="text-tan-500 text-sm mb-4">
            {targetHouseholdName
              ? `These apply to ${targetHouseholdName}. Your default household.`
              : 'These apply to your default household.'}
          </Text>

          <View className="gap-3">
            <Button title="📤 Export Data" onPress={handleExport} variant="outline" />
            {/* Replaces "Import Backup".
                Import read a JSON file this app had exported and wrote it into
                your default household. It is a developer's answer to a real
                problem: two people move in together and want one account.
                Nobody in that situation thinks "I will export my pets as JSON".
                Same operation, named for the thing people are actually doing,
                and only shown when there is somewhere to merge INTO. */}
            {mergeTargets.map((h: { id: string; name: string }) => (
              <Button
                key={h.id}
                title={`🏠 Move my pets into ${h.name}`}
                onPress={() => handleMerge(h.id, h.name)}
                variant="outline"
                loading={merging === h.id}
                disabled={merging !== null}
              />
            ))}
            <Button title="🗑️ Clear All Data" onPress={handleClearData} variant="outline" />
          </View>
        </Card>

        {/* About & policies */}
        <Card className="mb-4">
          <Text className="text-lg font-semibold text-brown-800 mb-3">About & Policies</Text>
          {POLICY_LINKS.map((link, index) => (
            <Pressable
              key={link.route}
              // Root-stack routes: navigate bubbles up from the Main stack at
              // runtime, but MainStackParamList cannot see them, hence the cast.
              onPress={() => (navigation as any).navigate(link.route)}
              accessibilityRole="button"
              accessibilityLabel={link.label}
              className={`flex-row justify-between items-center py-2 ${
                index > 0 ? 'border-t border-tan-100' : ''
              }`}
            >
              <View className="flex-1 mr-3">
                <Text className="text-brown-800 font-medium">{link.label}</Text>
                <Text className="text-tan-500 text-sm">{link.description}</Text>
              </View>
              <Text className="text-tan-400 text-xl">›</Text>
            </Pressable>
          ))}
        </Card>

        {/* Sign Out */}
        <View className="mt-4 mb-8">
          <Button title="Sign Out" onPress={handleSignOut} variant="secondary" />
        </View>
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
