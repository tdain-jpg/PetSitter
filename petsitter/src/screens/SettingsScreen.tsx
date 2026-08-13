import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  Alert,
  Platform,
  Pressable,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Input, Card } from '../components';
import { useAuth, useData } from '../contexts';
import { showAlert } from '../lib/showAlert';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const { user, signOut } = useAuth();
  const { settings, updateSettings, exportAllData, importData, clearAllData, deceasedPets } =
    useData();

  const [geminiKey, setGeminiKey] = useState(settings?.gemini_api_key || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to sign out');
    }
  };

  const handleSaveApiKey = async () => {
    setIsSaving(true);
    try {
      const trimmed = geminiKey.trim();
      // Send null (not undefined) when the field is empty: undefined keys are
      // dropped from the UPDATE payload entirely, so the stored key would
      // never actually be cleared.
      await updateSettings({
        gemini_api_key: (trimmed || null) as unknown as string | undefined,
      });
      showAlert('Success', trimmed ? 'API key saved successfully!' : 'API key removed.');
    } catch (error: any) {
      showAlert('Error', error.message || 'Failed to save API key');
    } finally {
      setIsSaving(false);
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
      reader.onload = () => {
        const performImport = async () => {
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

        if (
          window.confirm(
            'Importing a backup REPLACES all of your current data (pets, guides, and share links). ' +
              'Share links stored in the backup keep working after the import. Continue?'
          )
        ) {
          performImport();
        }
      };
      reader.onerror = () => showAlert('Import Failed', 'Could not read the selected file.');
      reader.readAsText(file);
    };
    input.click();
  };

  const handleClearData = () => {
    const performClear = async () => {
      try {
        await clearAllData();
        showAlert('Success', 'All data has been cleared.');
      } catch (error: any) {
        showAlert('Error', error.message || 'Failed to clear data');
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Are you sure you want to delete ALL your data? This cannot be undone!')) {
        performClear();
      }
    } else {
      Alert.alert(
        'Clear All Data',
        'Are you sure you want to delete ALL your data? This cannot be undone!',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete Everything', style: 'destructive', onPress: performClear },
        ]
      );
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
        <View className="flex-row items-center">
          <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
          <Text className="text-xl font-bold text-brown-800 ml-4">Settings</Text>
        </View>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
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

        {/* AI Settings */}
        <Card className="mb-4">
          <Text className="text-lg font-semibold text-brown-800 mb-4">
            AI Settings (Google Gemini)
          </Text>
          <Text className="text-tan-500 text-sm mb-4">
            Enter your Google Gemini API key to enable AI-powered features like the Cheat Sheet generator.
          </Text>

          {/* Input's built-in secureTextEntry eye toggle is the single show/hide control */}
          <Input
            label="API Key"
            placeholder="Enter your Gemini API key"
            value={geminiKey}
            onChangeText={setGeminiKey}
            secureTextEntry
          />

          <Button
            title="Save API Key"
            onPress={handleSaveApiKey}
            loading={isSaving}
            disabled={isSaving}
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
      </ScrollView>
    </View>
  );
}
