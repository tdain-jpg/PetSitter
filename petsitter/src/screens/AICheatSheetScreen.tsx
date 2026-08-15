import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Button, Card, ScreenContainer, SecurityNote } from '../components';

const wordmark = require('../../assets/wordmark.png');
import { useData } from '../contexts';
import { supabase } from '../lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { COLORS } from '../constants';
import { showAlert } from '../lib/showAlert';
import { fillCheatSheetTokens } from '../lib/cheatSheetTokens';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';
import type { Guide, CheatSheet } from '../types';

type Props = NativeStackScreenProps<MainStackParamList, 'AICheatSheet'>;

export function AICheatSheetScreen({ navigation, route }: Props) {
  const { guideId } = route.params;
  const { guides, loadingGuides, getCheatSheet } = useData();

  const [guide, setGuide] = useState<Guide | null>(null);
  const [cheatSheet, setCheatSheet] = useState<CheatSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crownRequired, setCrownRequired] = useState(false);

  // `guides` is a dependency because a deep-link restore (hard reload of
  // /Main/AICheatSheet?guideId=...) mounts this screen before DataContext's
  // initial fetch resolves — the lookup must retry once guides arrive.
  // The getCheatSheet re-fetch this triggers is an idempotent read.
  useEffect(() => {
    loadData();
  }, [guideId, guides]);

  const loadData = async () => {
    setLoading(true);
    try {
      const foundGuide = guides.find((g) => g.id === guideId);
      if (foundGuide) {
        setGuide(foundGuide);
      }

      const existingSheet = await getCheatSheet(guideId);
      setCheatSheet(existingSheet);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);

    try {
      // The Edge Function reads the guide + pets server-side, calls the AI,
      // and upserts the cheat_sheets row itself before returning.
      const { data, error: invokeError } = await supabase.functions.invoke(
        'generate-cheat-sheet',
        { body: { guideId } }
      );

      if (invokeError) {
        // Non-2xx responses surface as a FunctionsHttpError whose `context`
        // is the raw Response; the JSON body carries the contract error code.
        let code: string | undefined;
        if (invokeError instanceof FunctionsHttpError) {
          try {
            const body = await invokeError.context.json();
            code = body?.error;
          } catch {
            // Body wasn't JSON — fall through to the generic message.
          }
        }

        if (code === 'crown_required') {
          setCrownRequired(true);
          return;
        }
        if (code === 'ai_not_configured') {
          setError('The AI helper is warming up — check back soon.');
          return;
        }
        const message =
          code === 'guide_not_found'
            ? 'This guide could not be found. It may have been deleted.'
            : code === 'ai_failed'
              ? 'The AI helper had trouble writing this cheat sheet. Please try again in a moment.'
              : invokeError.message || 'Something went wrong generating the cheat sheet.';
        setError(message);
        showAlert('Generation Failed', message);
        return;
      }

      // Success: the sheet is already persisted server-side. Re-fetch the
      // stored row so we render exactly what was saved (id, timestamps, model).
      // The re-fetch gets its own try/catch: a transient failure here must not
      // surface as "Generation Failed" — the paid generation already succeeded
      // and was saved, so falling into the outer catch would re-show the
      // Generate card and invite a second paid run for a sheet that exists.
      let savedSheet: CheatSheet | null = null;
      try {
        savedSheet = await getCheatSheet(guideId);
      } catch {
        // Ignore — fall back to the content the Edge Function returned.
      }
      if (savedSheet) {
        setCheatSheet(savedSheet);
      } else if (data?.content) {
        // Fallback (re-fetch threw or returned null, e.g. a transient network
        // blip or a read racing the upsert): render the returned content
        // directly so the user still sees their cheat sheet.
        setCheatSheet({
          id: guideId,
          guide_id: guideId,
          content: data.content,
          generated_at: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      setError(err.message);
      showAlert('Generation Failed', err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyToClipboard = async () => {
    if (!cheatSheet) return;

    try {
      // Copy the FILLED text — the stored content carries [[TOKEN]]
      // placeholders instead of real codes.
      const filled = fillCheatSheetTokens(cheatSheet.content, guide?.home_info);
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(filled);
      } else {
        const Clipboard = require('expo-clipboard');
        await Clipboard.setStringAsync(filled);
      }
      showAlert('Copied', 'Cheat sheet copied to clipboard!');
    } catch (err) {
      showAlert('Error', 'Failed to copy to clipboard');
    }
  };

  // Simple markdown-to-text renderer for display
  // Inline renderer: real bold instead of stripped ** markers.
  const renderInline = (
    text: string,
    baseClass: string,
    key: number | string
  ) => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return (
      <Text key={key} className={baseClass}>
        {parts.map((part, i) =>
          i % 2 === 1 ? (
            <Text key={i} className="font-bold text-brown-800">
              {part}
            </Text>
          ) : (
            part
          )
        )}
      </Text>
    );
  };

  const renderMarkdown = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, index) => {
      const t = line.trim();

      // Horizontal rules → a real divider, never literal dashes.
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
        return <View key={index} className="border-t border-tan-200 my-3" />;
      }
      // Markdown-table separator rows (|---|---|) → drop entirely.
      if (/^\|[\s\-:|]+\|$/.test(t)) {
        return null;
      }
      // Table rows → label/value lines. The prompt forbids tables, but raw
      // pipes must never reach a reader if the model emits one anyway.
      if (t.startsWith('|')) {
        const cells = t
          .split('|')
          .map((c) => c.trim())
          .filter((c) => c.length > 0);
        if (cells.length === 0) return null;
        const asText =
          cells.length >= 2
            ? `**${cells[0].replace(/\*\*/g, '')}:** ${cells.slice(1).join(' · ')}`
            : cells[0];
        return renderInline(asText, 'text-brown-600 mb-1', index);
      }

      // Headers
      if (line.startsWith('### ')) {
        return renderInline(
          line.slice(4),
          'text-base font-semibold text-brown-800 mt-4 mb-2',
          index
        );
      }
      if (line.startsWith('## ')) {
        return (
          <View
            key={index}
            className="mt-5 mb-2 pb-1 border-b border-tan-200"
          >
            {renderInline(
              line.slice(3),
              'text-lg font-bold text-primary-600',
              `h${index}`
            )}
          </View>
        );
      }
      if (line.startsWith('# ')) {
        return renderInline(
          line.slice(2),
          'text-xl font-bold text-primary-600 mt-4 mb-3',
          index
        );
      }

      // Blockquotes → warning callout
      if (t.startsWith('>')) {
        return (
          <View
            key={index}
            className="bg-cream-100 border-l-4 border-accent-500 rounded px-3 py-2 my-2"
          >
            {renderInline(
              t.replace(/^>\s*/, ''),
              'text-brown-800 text-sm',
              `q${index}`
            )}
          </View>
        );
      }

      // Bullets and numbered lists
      if (t.startsWith('- ') || t.startsWith('* ')) {
        return renderInline(
          `•  ${t.replace(/^[-*] /, '')}`,
          'text-brown-600 ml-3 mb-1',
          index
        );
      }
      if (/^\d+\.\s/.test(t)) {
        return renderInline(t, 'text-brown-600 ml-3 mb-1', index);
      }

      // Empty lines
      if (t === '') {
        return <View key={index} className="h-2" />;
      }

      // Regular text
      return renderInline(line, 'text-brown-600 mb-1', index);
    });
  };

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
          <View className="flex-row items-center justify-between">
            <Button title="← Back" onPress={() => navigation.goBack()} variant="outline" />
            {cheatSheet && (
              <Button title="📋 Copy" onPress={handleCopyToClipboard} variant="secondary" />
            )}
          </View>
          <View className="mt-4">
            <Text className="text-2xl font-bold text-brown-800">🤖 AI Cheat Sheet</Text>
            <Text className="text-tan-500">{guide.title}</Text>
          </View>
        </ScreenContainer>
      </View>

      <ScrollView className="flex-1 p-4">
        <ScreenContainer variant="content">
        {!cheatSheet ? (
          crownRequired ? (
            <Card className="items-center py-8 bg-warm-50 border-warm-300">
              <Text className="text-xl font-semibold text-brown-800 mb-2 text-center">
                👑 Pawstructions Crown
              </Text>
              <Text className="text-brown-600 text-center">
                AI cheat sheets are a Crown member feature. Crown covers the cost
                of the AI that writes them — coming soon.
              </Text>
            </Card>
          ) : (
            <Card className="items-center py-8">
              <Text className="text-5xl mb-4">🤖</Text>
              <Text className="text-xl font-semibold text-brown-800 mb-2 text-center">
                Generate AI Cheat Sheet
              </Text>
              <Text className="text-tan-500 text-center mb-6">
                Use AI to create a quick reference summary of this guide for your pet sitter.
              </Text>

              {error && (
                <Text className="text-accent-500 mb-4 text-center">{error}</Text>
              )}

              <Button
                title={generating ? 'Generating...' : '✨ Generate Cheat Sheet'}
                onPress={handleGenerate}
                loading={generating}
                disabled={generating}
              />

              <Text className="text-tan-500 text-sm mt-4 mb-2 text-center">
                Guide contents are summarized by Pawstructions&apos; AI helper.
              </Text>
              <SecurityNote context="ai" />
            </Card>
          )
        ) : (
          <>
            <Card className="mb-4">
              {/* Branded sheet header */}
              <View className="items-center mb-3">
                <Image
                  source={wordmark}
                  style={{ width: 150, height: 31 }}
                  resizeMode="contain"
                  accessibilityLabel="Pawstructions"
                />
                <Text className="text-tan-400 text-xs mt-2" style={{ letterSpacing: 2 }}>
                  👑 CROWN AI CHEAT SHEET
                </Text>
                <Text className="text-tan-400 text-xs mt-1">
                  Generated {new Date(cheatSheet.generated_at).toLocaleString()}
                </Text>
              </View>
              <SecurityNote context="ai" />

              <View className="border-t border-tan-200 pt-4">
                {renderMarkdown(fillCheatSheetTokens(cheatSheet.content, guide?.home_info))}
              </View>
            </Card>

            {crownRequired ? (
              <Card className="items-center py-8 mb-8 bg-warm-50 border-warm-300">
                <Text className="text-xl font-semibold text-brown-800 mb-2 text-center">
                  👑 Pawstructions Crown
                </Text>
                <Text className="text-brown-600 text-center">
                  AI cheat sheets are a Crown member feature. Crown covers the cost
                  of the AI that writes them — coming soon.
                </Text>
              </Card>
            ) : (
              <View className="gap-3 mb-8">
                {error && (
                  <Text className="text-accent-500 text-center">{error}</Text>
                )}
                <Button
                  title="🔄 Regenerate"
                  onPress={handleGenerate}
                  loading={generating}
                  disabled={generating}
                  variant="outline"
                />
                <Text className="text-tan-500 text-sm text-center">
                  Guide contents are summarized by Pawstructions&apos; AI helper.
                </Text>
              </View>
            )}
          </>
        )}
        </ScreenContainer>
      </ScrollView>
    </View>
  );
}
