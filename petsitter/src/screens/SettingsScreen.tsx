import { useCallback, useState } from 'react';
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
import { Button, Card, ScreenContainer } from '../components';
import { useAuth, useData } from '../contexts';
import { supabase } from '../lib/supabase';
import { showAlert } from '../lib/showAlert';
import { showConfirm } from '../lib/dialogs';
import { hasPendingCrownCheckout } from './UnlockCrownScreen';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

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
    importData,
    clearAllData,
    deceasedPets,
    households,
    primaryHouseholdId,
    sitterConnections,
    pendingSitterInvites,
  } = useData();

  const [isImporting, setIsImporting] = useState(false);

  // Crown is bought per HOUSEHOLD, so this card is about the default household
  // — the same one Data Management targets. null = no answer yet (still
  // reading, no household, or the read failed) and is deliberately distinct
  // from false: offering "Unlock — $5" to someone who has already paid is the
  // one mistake worth designing around, so an unknown answer keeps the neutral
  // wording. Read only through has_crown(h), the membership-gated RPC, never a
  // households column.
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

  // Import and Clear All Data target the DEFAULT household, whichever one that
  // is — and since migration 0011 that is often the SHARED family household,
  // not the personal one. "your household" was safe copy only while the default
  // was always the user's own: to someone who belongs to two, it reads like the
  // one literally named "My Household". Name the real target instead.
  const targetHouseholdName =
    households.find((household) => household.id === primaryHouseholdId)?.name ?? null;
  const targetHousehold = targetHouseholdName ?? 'your household';

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to sign out');
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
      showAlert('Error', error.message || 'Failed to export data');
    }
  };

  const handleImport = () => {
    if (Platform.OS !== 'web') {
      showAlert('Import Backup', 'Import is available on the web app.');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.style.display = 'none';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async () => {
        const confirmed = await showConfirm({
          title: `Replace Data in ${targetHousehold}?`,
          message:
            `Importing a backup REPLACES every pet, guide, and share link in ${targetHousehold} with the backup's contents — ` +
            'including pets and guides that other members of it added, for everyone in it. ' +
            "Other households you've joined are not affected. " +
            'Share links stored in the backup keep working after the import.',
          confirmLabel: 'Import & Replace',
          destructive: true,
        });
        if (!confirmed) return;

        setIsImporting(true);
        try {
          const data = JSON.parse(String(reader.result));
          await importData(data);
          showAlert('Success', 'Backup imported successfully!');
        } catch (error: any) {
          showAlert('Import Failed', error?.message || 'Could not import the backup file.');
        } finally {
          setIsImporting(false);
        }
      };
      reader.onerror = () => showAlert('Import Failed', 'Could not read the selected file.');
      reader.readAsText(file);
    };
    input.click();
  };

  const handleClearData = async () => {
    const confirmed = await showConfirm({
      title: `Delete Everything in ${targetHousehold}?`,
      message:
        `This permanently deletes every pet, guide, and share link in ${targetHousehold} — ` +
        'including any that other members of it added and still use. It affects everyone ' +
        "in that household. Other households you've joined are not affected. " +
        'There is no undo — once deleted, this data cannot be recovered.',
      confirmLabel: 'Delete Everything',
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await clearAllData();
      showAlert('Success', 'All data has been cleared.');
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to clear data');
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
            <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
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

        {/* Crown */}
        <Card className="mb-4 bg-warm-50 border-warm-300">
          {hasCrown === true ? (
            <>
              <Text className="text-lg font-semibold text-brown-800 mb-1">
                👑 Crown is active
              </Text>
              <Text className="text-brown-600 text-sm mb-3">
                {`Every AI cheat sheet in ${targetHousehold} is unlocked — no PREVIEW watermark on screen, and none in the PDF you hand your sitter. Nothing else to pay.`}
              </Text>
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
                watermark — $5 once for a whole household, not a subscription.
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
                        ? '👑 Unlock Crown — $5'
                        : '👑 About Crown'
                  }
                  onPress={() => navigation.navigate('UnlockCrown')}
                />
              </View>
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
            A PENDING invitation counts too — it comes from a different source
            (my_pending_sitter_invites, since an unaccepted row has no
            sitter_user_id), and without it a freshly invited sitter would sign
            up and find no way in at all. */}
        {(sitterConnections.length > 0 || pendingSitterInvites.length > 0) && (
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
          </Card>
        )}

        {/* Preferences */}
        <Card className="mb-4">
          <Text className="text-lg font-semibold text-brown-800 mb-4">Preferences</Text>

          <View className="flex-row justify-between items-center mb-4">
            <View className="flex-1">
              <Text className="text-brown-800">Auto-Save</Text>
              <Text className="text-tan-500 text-sm">
                Automatically save changes as you type
              </Text>
            </View>
            <Switch
              value={settings?.auto_save_enabled ?? true}
              onValueChange={(v) => handleToggleSetting('auto_save_enabled', v)}
              accessibilityLabel="Auto-save changes as you type"
            />
          </View>

          <View className="flex-row justify-between items-center">
            <View className="flex-1">
              <Text className="text-brown-800">Notifications</Text>
              <Text className="text-tan-500 text-sm">
                Receive reminders and updates
              </Text>
            </View>
            <Switch
              value={settings?.notifications_enabled ?? true}
              onValueChange={(v) => handleToggleSetting('notifications_enabled', v)}
              accessibilityLabel="Receive reminders and updates"
            />
          </View>
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
              ? `These apply to ${targetHouseholdName} — your default household.`
              : 'These apply to your default household.'}
          </Text>

          <View className="gap-3">
            <Button title="📤 Export Data" onPress={handleExport} variant="outline" />
            <Button
              title="📥 Import Backup"
              onPress={handleImport}
              variant="outline"
              loading={isImporting}
              disabled={isImporting}
            />
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
