import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
  Pressable,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card } from '../components';
import { useData } from '../contexts';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList } from '../navigation/types';
import type { Guide, ShareableLink } from '../types';

type Props = NativeStackScreenProps<MainTabParamList, 'ShareGuide'>;

export function ShareGuideScreen({ navigation, route }: Props) {
  const { guideId } = route.params;
  const { guides, getShareLinks, createShareLink, deactivateShareLink } = useData();

  const [guide, setGuide] = useState<Guide | null>(null);
  const [links, setLinks] = useState<ShareableLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadData();
  }, [guideId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const foundGuide = guides.find((g) => g.id === guideId);
      setGuide(foundGuide || null);

      const allLinks = await getShareLinks();
      setLinks(allLinks.filter((l) => l.guide_id === guideId));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLink = async (expiresInDays?: number) => {
    setCreating(true);
    try {
      const newLink = await createShareLink(guideId, expiresInDays);
      setLinks((prev) => [...prev, newLink]);
    } catch (error: any) {
      const message = error.message || 'Failed to create link';
      if (Platform.OS === 'web') {
        alert(message);
      } else {
        Alert.alert('Error', message);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async (linkId: string) => {
    try {
      await deactivateShareLink(linkId);
      setLinks((prev) =>
        prev.map((l) => (l.id === linkId ? { ...l, is_active: false } : l))
      );
    } catch (error: any) {
      const message = error.message || 'Failed to deactivate link';
      if (Platform.OS === 'web') {
        alert(message);
      } else {
        Alert.alert('Error', message);
      }
    }
  };

  const handleCopyLink = async (code: string) => {
    const url = `${Platform.OS === 'web' ? window.location.origin : 'petsitter://'}share/${code}`;

    try {
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(url);
        alert('Link copied to clipboard!');
      } else {
        const Clipboard = require('expo-clipboard');
        await Clipboard.setStringAsync(url);
        Alert.alert('Copied', 'Link copied to clipboard!');
      }
    } catch (err) {
      const message = 'Failed to copy link';
      if (Platform.OS === 'web') {
        alert(message);
      } else {
        Alert.alert('Error', message);
      }
    }
  };

  const activeLinks = links.filter((l) => l.is_active);
  const inactiveLinks = links.filter((l) => !l.is_active);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (!guide) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <Text className="text-xl text-gray-500 mb-4">Guide not found</Text>
        <Button title="Go Back" onPress={() => navigation.goBack()} variant="outline" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-white border-b border-gray-100">
        <View className="flex-row items-center">
          {Platform.OS === 'web' ? (
            <button
              onClick={() => navigation.goBack()}
              style={{
                padding: '8px 16px',
                backgroundColor: 'transparent',
                color: '#2563eb',
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
        </View>
        <View className="mt-4">
          <Text className="text-2xl font-bold text-gray-900">🔗 Share Guide</Text>
          <Text className="text-gray-500">{guide.title}</Text>
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
        {/* Create New Link */}
        <Card className="mb-4">
          <Text className="text-lg font-semibold text-gray-900 mb-4">
            Create Share Link
          </Text>
          <Text className="text-gray-500 mb-4">
            Generate a link that lets others view your guide in read-only mode.
          </Text>

          <View className="gap-3">
            <Button
              title="Create Link (No Expiry)"
              onPress={() => handleCreateLink()}
              loading={creating}
              disabled={creating}
            />
            <Button
              title="Create Link (Expires in 7 days)"
              onPress={() => handleCreateLink(7)}
              loading={creating}
              disabled={creating}
              variant="outline"
            />
            <Button
              title="Create Link (Expires in 30 days)"
              onPress={() => handleCreateLink(30)}
              loading={creating}
              disabled={creating}
              variant="outline"
            />
          </View>
        </Card>

        {/* Active Links */}
        {activeLinks.length > 0 && (
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-gray-900 mb-4">
              Active Links ({activeLinks.length})
            </Text>

            {activeLinks.map((link) => (
              <View
                key={link.id}
                className="bg-gray-50 rounded-lg p-4 mb-3 border border-gray-200"
              >
                <View className="flex-row justify-between items-start mb-2">
                  <View className="flex-1">
                    <Text className="font-mono text-primary-600 text-lg">
                      {link.code}
                    </Text>
                    <Text className="text-gray-400 text-sm">
                      Created {new Date(link.created_at).toLocaleDateString()}
                    </Text>
                    {link.expires_at && (
                      <Text className="text-orange-500 text-sm">
                        Expires {new Date(link.expires_at).toLocaleDateString()}
                      </Text>
                    )}
                    <Text className="text-gray-500 text-sm">
                      Views: {link.view_count}
                    </Text>
                  </View>
                </View>

                <View className="flex-row gap-2">
                  {Platform.OS === 'web' ? (
                    <>
                      <button
                        onClick={() => handleCopyLink(link.code)}
                        style={{
                          flex: 1,
                          padding: '8px 16px',
                          backgroundColor: '#eff6ff',
                          color: '#2563eb',
                          border: 'none',
                          borderRadius: 8,
                          cursor: 'pointer',
                          fontSize: 14,
                        }}
                      >
                        📋 Copy Link
                      </button>
                      <button
                        onClick={() => handleDeactivate(link.id)}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#fee2e2',
                          color: '#dc2626',
                          border: 'none',
                          borderRadius: 8,
                          cursor: 'pointer',
                          fontSize: 14,
                        }}
                      >
                        Deactivate
                      </button>
                    </>
                  ) : (
                    <>
                      <View className="flex-1">
                        <Button
                          title="📋 Copy Link"
                          onPress={() => handleCopyLink(link.code)}
                          variant="outline"
                        />
                      </View>
                      <Pressable
                        onPress={() => handleDeactivate(link.id)}
                        className="bg-red-50 px-4 py-2 rounded-lg"
                      >
                        <Text className="text-red-600">Deactivate</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              </View>
            ))}
          </Card>
        )}

        {/* Inactive Links */}
        {inactiveLinks.length > 0 && (
          <Card className="mb-8">
            <Text className="text-lg font-semibold text-gray-500 mb-4">
              Inactive Links ({inactiveLinks.length})
            </Text>

            {inactiveLinks.map((link) => (
              <View
                key={link.id}
                className="bg-gray-100 rounded-lg p-3 mb-2 opacity-60"
              >
                <Text className="font-mono text-gray-500">{link.code}</Text>
                <Text className="text-gray-400 text-sm">
                  Deactivated • Views: {link.view_count}
                </Text>
              </View>
            ))}
          </Card>
        )}

        {links.length === 0 && (
          <Card className="items-center py-8">
            <Text className="text-5xl mb-4">🔗</Text>
            <Text className="text-gray-500 text-center">
              No share links created yet. Create one above to share your guide!
            </Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}
