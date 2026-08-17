import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, ScreenContainer } from '../components';
import { useData } from '../contexts';
import { COLORS, WEB_BASE_URL } from '../constants';
import { showAlert, showConfirm } from '../lib/dialogs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { Guide, ShareableLink } from '../types';
import { friendlyError } from '../lib/errors';

type Props = NativeStackScreenProps<MainStackParamList, 'ShareGuide'>;

/**
 * The address a sitter actually opens. Always a web URL — recipients (pet
 * sitters) may not have the app installed.
 */
function shareUrlFor(code: string): string {
  const origin = Platform.OS === 'web' ? window.location.origin : WEB_BASE_URL;
  return `${origin}/share/${code}`;
}

/**
 * Writes `text` to the clipboard, reporting failure instead of throwing.
 *
 * On web the async Clipboard API is missing entirely on insecure origins and
 * rejects outright when the permission is denied, so a refused write falls back
 * to the legacy selection-based copy: deprecated, but it runs inside the
 * button's own user gesture and asks for no permission, which is exactly the
 * case that fails.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  if (Platform.OS !== 'web') {
    try {
      const Clipboard = require('expo-clipboard');
      await Clipboard.setStringAsync(text);
      return true;
    } catch {
      return false;
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Denied or unavailable — try the legacy path below rather than giving up.
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  // Off-screen rather than hidden: execCommand copies the live selection, and
  // a display:none element can never hold one. readonly keeps the mobile
  // keyboard from popping up when it takes focus.
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  try {
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

export function ShareGuideScreen({ navigation, route }: Props) {
  const { guideId } = route.params;
  const { guides, loadingGuides, getShareLinksForGuide, createShareLink, deactivateShareLink } = useData();

  const [guide, setGuide] = useState<Guide | null>(null);
  const [links, setLinks] = useState<ShareableLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // `guides` is a dependency because a deep-link restore (hard reload of
  // /Main/ShareGuide?guideId=...) mounts this screen before DataContext's
  // initial fetch resolves — the lookup must retry once guides arrive.
  // The share-links re-fetch this triggers is an idempotent read.
  useEffect(() => {
    loadData();
  }, [guideId, guides]);

  const loadData = async () => {
    setLoading(true);
    try {
      const foundGuide = guides.find((g) => g.id === guideId);
      setGuide(foundGuide || null);

      // Household-scoped (not just the current user's links): creating a link
      // deactivates EVERY active link for this guide, so a housemate's live
      // link must be visible here before this member replaces it.
      setLinks(await getShareLinksForGuide(guideId));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLink = async (expiresInDays?: number) => {
    setCreating(true);
    try {
      const newLink = await createShareLink(guideId, expiresInDays);
      // The server deactivated every previously-active link for this guide
      // before inserting the new one — mirror that locally so a dead link
      // (possibly a housemate's) never keeps showing as active.
      setLinks((prev) => [...prev.map((l) => ({ ...l, is_active: false })), newLink]);
    } catch (error: any) {
      const message = friendlyError(error, 'Failed to create link');
      showAlert('Error', message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeactivate = async (linkId: string) => {
    const ok = await showConfirm({
      title: 'Deactivate Link',
      message:
        "Your pet sitter's link will stop working immediately and cannot be reactivated.",
      confirmLabel: 'Deactivate',
      destructive: true,
    });
    if (!ok) return;

    try {
      await deactivateShareLink(linkId);
      setLinks((prev) =>
        prev.map((l) => (l.id === linkId ? { ...l, is_active: false } : l))
      );
    } catch (error: any) {
      const message = friendlyError(error, 'Failed to deactivate link');
      showAlert('Error', message);
    }
  };

  const handleCopyLink = async (code: string) => {
    if (await copyToClipboard(shareUrlFor(code))) {
      showAlert('Copied', 'Link copied to clipboard!');
      return;
    }
    // A blocked clipboard must not strand a link the user just created: the
    // card shows the whole URL as selectable text, so point at it instead of
    // reporting a failure with no way out.
    showAlert(
      "Couldn't Copy",
      'This device blocked the clipboard. The full link is shown on the card — select it and copy it by hand.'
    );
  };

  const handlePreview = (code: string) => {
    (navigation as any).navigate('SharedGuideView', { code });
  };

  const activeLinks = links.filter((l) => l.is_active);
  const inactiveLinks = links.filter((l) => !l.is_active);

  // Keep spinning while the household guides are still loading — declaring
  // "not found" before the initial fetch resolves would be a false negative.
  if (loading || (!guide && loadingGuides)) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-200">
        <ActivityIndicator size="large" color={COLORS.secondary} />
      </View>
    );
  }

  if (!guide) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-200">
        <Text className="text-xl text-tan-500 mb-4">Guide not found</Text>
        <Button title="Go Back" onPress={() => navigation.goBack()} variant="outline" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream-200">
      <StatusBar style="dark" />

      {/* Header */}
      <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
        <ScreenContainer variant="content">
          <View className="flex-row items-center">
            <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
          </View>
          <View className="mt-4">
            <Text className="text-2xl font-bold text-brown-800">🔗 Share Guide</Text>
            <Text className="text-tan-500">{guide.title}</Text>
          </View>
        </ScreenContainer>
      </View>

      <ScrollView className="flex-1 p-4">
        <ScreenContainer variant="content">
          {/* Create New Link */}
          <Card className="mb-4">
            <Text className="text-lg font-semibold text-brown-800 mb-4">
              Create Share Link
            </Text>
            <Text className="text-tan-500 mb-4">
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
              <Text className="text-lg font-semibold text-brown-800 mb-4">
                Active Links ({activeLinks.length})
              </Text>

              {activeLinks.map((link) => (
                <View
                  key={link.id}
                  className="bg-cream-200 rounded-lg p-4 mb-3 border border-tan-200"
                >
                  <View className="flex-row justify-between items-start mb-2">
                    <View className="flex-1">
                      {/* The whole URL, not just the token: this is the one
                          place the link exists, and it has to survive a failed
                          clipboard write. `userSelect` (not the `selectable`
                          prop, which react-native-web has deprecated) keeps it
                          hand-copyable on web and native alike. */}
                      <Text
                        className="font-mono text-primary-600 text-sm mb-1"
                        style={{ userSelect: 'text' }}
                      >
                        {shareUrlFor(link.code)}
                      </Text>
                      <Text className="text-tan-400 text-sm">
                        Created {new Date(link.created_at).toLocaleDateString()}
                      </Text>
                      {link.expires_at && (
                        <Text className="text-orange-500 text-sm">
                          Expires {new Date(link.expires_at).toLocaleDateString()}
                        </Text>
                      )}
                      <Text className="text-tan-500 text-sm">
                        Views: {link.view_count}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row gap-2 flex-wrap">
                    <View className="flex-1">
                      <Button
                        title="👁️ Preview"
                        onPress={() => handlePreview(link.code)}
                        variant="secondary"
                      />
                    </View>
                    <View className="flex-1">
                      <Button
                        title="📋 Copy"
                        onPress={() => handleCopyLink(link.code)}
                        variant="outline"
                      />
                    </View>
                    <View className="flex-1">
                      <Button
                        title="Deactivate"
                        onPress={() => handleDeactivate(link.id)}
                        variant="danger"
                      />
                    </View>
                  </View>
                </View>
              ))}
            </Card>
          )}

          {/* Inactive Links */}
          {inactiveLinks.length > 0 && (
            <Card className="mb-8">
              <Text className="text-lg font-semibold text-tan-500 mb-4">
                Inactive Links ({inactiveLinks.length})
              </Text>

              {inactiveLinks.map((link) => (
                <View
                  key={link.id}
                  className="bg-tan-100 rounded-lg p-3 mb-2 opacity-60"
                >
                  <Text className="font-mono text-tan-500">{link.code}</Text>
                  <Text className="text-tan-400 text-sm">
                    Deactivated • Views: {link.view_count}
                  </Text>
                </View>
              ))}
            </Card>
          )}

          {links.length === 0 && (
            <Card className="items-center py-8">
              <Text className="text-5xl mb-4">🔗</Text>
              <Text className="text-tan-500 text-center">
                No share links created yet. Create one above to share your guide!
              </Text>
            </Card>
          )}
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
