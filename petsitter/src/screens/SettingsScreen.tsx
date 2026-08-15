import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  Platform,
  Pressable,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, ScreenContainer } from '../components';
import { useAuth, useData } from '../contexts';
import { showAlert } from '../lib/showAlert';
import { showConfirm } from '../lib/dialogs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const { user, signOut } = useAuth();
  const { settings, updateSettings, exportAllData, importData, clearAllData, deceasedPets } =
    useData();

  const [isImporting, setIsImporting] = useState(false);

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
          title: 'Replace Household Data?',
          message:
            "Importing a backup REPLACES every pet, guide, and share link in your household with the backup's contents — " +
            'including pets and guides that other household members added, for everyone in the household. ' +
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
      title: 'Delete Your Household Data?',
      message:
        'This permanently deletes every pet, guide, and share link in your household — ' +
        'including any that other household members added and still use. It affects everyone ' +
        "in the household. Other households you've joined are not affected. " +
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

        {/* Crown teaser */}
        <Card className="mb-4 bg-warm-50 border-warm-300">
          <Text className="text-lg font-semibold text-brown-800 mb-1">
            👑 Crown — coming soon
          </Text>
          <Text className="text-brown-600 text-sm mb-3">
            AI-written cheat sheets for your sitters, while supporting Pawstructions.
          </Text>
          <Button
            title="👀 See a Sample Cheat Sheet"
            onPress={() => navigation.navigate('SampleCheatSheet')}
            variant="outline"
          />
        </Card>

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
          <Text className="text-lg font-semibold text-brown-800 mb-4">Data Management</Text>

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

        {/* Sign Out */}
        <View className="mt-4 mb-8">
          <Button title="Sign Out" onPress={handleSignOut} variant="secondary" />
        </View>
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
