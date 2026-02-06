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
import { COLORS } from '../constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainTabParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const { user, signOut } = useAuth();
  const { settings, updateSettings, exportAllData, clearAllData, deceasedPets } = useData();

  const [geminiKey, setGeminiKey] = useState(settings?.gemini_api_key || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error: any) {
      if (Platform.OS === 'web') {
        alert(error.message || 'Failed to sign out');
      } else {
        Alert.alert('Error', error.message || 'Failed to sign out');
      }
    }
  };

  const handleSaveApiKey = async () => {
    setIsSaving(true);
    try {
      await updateSettings({ gemini_api_key: geminiKey.trim() || undefined });
      if (Platform.OS === 'web') {
        alert('API key saved successfully!');
      } else {
        Alert.alert('Success', 'API key saved successfully!');
      }
    } catch (error: any) {
      const message = error.message || 'Failed to save API key';
      if (Platform.OS === 'web') {
        alert(message);
      } else {
        Alert.alert('Error', message);
      }
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
        a.download = `petsitter-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        Alert.alert('Export', 'Data exported. In a production app, this would save to device.');
      }
    } catch (error: any) {
      const message = error.message || 'Failed to export data';
      if (Platform.OS === 'web') {
        alert(message);
      } else {
        Alert.alert('Error', message);
      }
    }
  };

  const handleClearData = () => {
    const performClear = async () => {
      try {
        await clearAllData();
        if (Platform.OS === 'web') {
          alert('All data has been cleared.');
        } else {
          Alert.alert('Success', 'All data has been cleared.');
        }
      } catch (error: any) {
        const message = error.message || 'Failed to clear data';
        if (Platform.OS === 'web') {
          alert(message);
        } else {
          Alert.alert('Error', message);
        }
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
          {Platform.OS === 'web' ? (
            <button
              onClick={() => navigation.goBack()}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                color: COLORS.secondary,
                border: 'none',
                cursor: 'pointer',
                fontSize: 16,
              }}
            >
              ← Back
            </button>
          ) : (
            <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
          )}
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

          {Platform.OS === 'web' ? (
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 14, color: '#374151', marginBottom: 8, fontWeight: 500 }}>
                API Key
              </label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="Enter your Gemini API key"
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    fontSize: 14,
                  }}
                />
                <button
                  onClick={() => setShowApiKey(!showApiKey)}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: COLORS.creamDark,
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer',
                  }}
                >
                  {showApiKey ? '🙈' : '👁️'}
                </button>
              </div>
            </div>
          ) : (
            <View className="flex-row items-center mb-4">
              <View className="flex-1">
                <Input
                  label="API Key"
                  placeholder="Enter your Gemini API key"
                  value={geminiKey}
                  onChangeText={setGeminiKey}
                  secureTextEntry={!showApiKey}
                />
              </View>
              <Pressable
                onPress={() => setShowApiKey(!showApiKey)}
                className="ml-2 p-2"
              >
                <Text>{showApiKey ? '🙈' : '👁️'}</Text>
              </Pressable>
            </View>
          )}

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
            />
          </View>
        </Card>

        {/* Memorial */}
        {deceasedPets.length > 0 && (
          <Card className="mb-4">
            <Pressable
              onPress={() => (navigation as any).navigate('Memorial')}
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
