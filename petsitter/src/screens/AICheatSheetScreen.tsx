import { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Platform,
  Share,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { Button, Card, CheatSheetView, ScreenContainer, SecurityNote } from '../components';
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

/**
 * Writes `text` to the clipboard, reporting failure instead of throwing.
 *
 * On web the async Clipboard API is missing entirely on insecure origins and
 * rejects outright when the permission is denied, so a refused write falls back
 * to the legacy selection-based copy: deprecated, but it runs inside the
 * button's own user gesture and asks for no permission, which is exactly the
 * case that fails.
 *
 * Deliberately duplicated from ShareGuideScreen: the two screens share no
 * clipboard module today, and adding one is a wider change than this fix.
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

/**
 * Turns the server's `retry_after_minutes` into something a person would say.
 *
 * The number is the SERVER's to decide — the free-tier ceiling and its window
 * live in the Edge Function and are free to change — so nothing here assumes a
 * value. With no usable number the wording stays deliberately vague: inventing
 * "an hour" and being wrong is worse than saying "in a little while".
 */
function describeRetryWait(minutes: number | undefined): string {
  if (minutes === undefined) return 'in a little while';
  if (minutes <= 1) return 'in a minute';
  if (minutes < 120) return `in about ${minutes} minutes`;
  return `in about ${Math.ceil(minutes / 60)} hours`;
}

export function AICheatSheetScreen({ navigation, route }: Props) {
  const { guideId } = route.params;
  const { guides, loadingGuides, getCheatSheet } = useData();

  const [guide, setGuide] = useState<Guide | null>(null);
  const [cheatSheet, setCheatSheet] = useState<CheatSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crownRequired, setCrownRequired] = useState(false);
  // null = entitlement not established yet: the load hasn't finished, the
  // has_crown read failed, or the guide carries no household_id. See
  // `watermarked` below for why that renders CLEAN rather than watermarked.
  const [hasCrown, setHasCrown] = useState<boolean | null>(null);

  // Sheets are STORED unwatermarked; the wash is a render-time decision keyed
  // off Crown, so a purchase clears it with no regeneration and no second AI
  // charge. Unknown entitlement deliberately renders CLEAN: stamping PREVIEW
  // across a paying household's sheet because an RPC timed out is far worse
  // than missing a nudge, and the watermark is a nudge, not DRM.
  const watermarked = hasCrown === false;

  // The 402 that sets crownRequired is a point-in-time refusal, and this screen
  // OUTLIVES it: the buyer walks to UnlockCrown, pays, and comes back to the
  // same mounted instance. Entitlement is authoritative over the stale refusal,
  // so a confirmed Crown retires the paywall. An UNKNOWN entitlement
  // (hasCrown === null — read failed, or no household_id) does not clear it on
  // its own; refreshCrown clears the flag outright the moment it sees a real
  // true, which is what keeps a later failed read from re-raising the paywall
  // on a household that has already paid.
  const showCrownPaywall = crownRequired && hasCrown !== true;

  // Entitlement decides the watermark on a sheet we didn't generate this
  // session. has_crown is membership-gated, so a non-member simply gets false.
  // A failed read leaves hasCrown ALONE rather than setting false: stamping
  // PREVIEW across a paying household's sheet because an RPC timed out is the
  // outcome to avoid.
  const refreshCrown = useCallback(async (householdId: string | null | undefined) => {
    if (!householdId) return;
    try {
      const { data, error: crownError } = await supabase.rpc('has_crown', { h: householdId });
      if (!crownError) {
        const active = data === true;
        setHasCrown(active);
        // Clear the stale 402 outright once entitlement confirms Crown. Doing
        // it here rather than only at render time means a LATER failed read
        // can never resurrect the paywall for a household that just paid.
        if (active) setCrownRequired(false);
      }
    } catch {
      // See above — the sheet keeps rendering however it already was.
    }
  }, []);

  // `guides` is a dependency because a deep-link restore (hard reload of
  // /Main/AICheatSheet?guideId=...) mounts this screen before DataContext's
  // initial fetch resolves — the lookup must retry once guides arrive.
  // The getCheatSheet re-fetch this triggers is an idempotent read.
  useEffect(() => {
    loadData();
  }, [guideId, guides]);

  // Crown can arrive while this screen just sits in the stack: the buyer
  // returns from UnlockCrown (which changes neither guideId nor guides, so
  // nothing above re-runs), or another member of the household buys it on
  // their own device. Re-ask on focus so the PREVIEW wash clears.
  useFocusEffect(
    useCallback(() => {
      refreshCrown(guide?.household_id);
    }, [guide?.household_id, refreshCrown])
  );

  const loadData = async () => {
    setLoading(true);
    try {
      const foundGuide = guides.find((g) => g.id === guideId);
      if (foundGuide) {
        setGuide(foundGuide);
      }

      const existingSheet = await getCheatSheet(guideId);
      setCheatSheet(existingSheet);

      // Read here as well as on focus so the first paint already knows which
      // side of the paywall it is on — the focus pass alone would render the
      // sheet clean for a beat and then wash it. refreshCrown swallows its own
      // failures, so a bad entitlement read can never surface as "the cheat
      // sheet couldn't load".
      await refreshCrown(foundGuide?.household_id);
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
        let retryAfterMinutes: number | undefined;
        if (invokeError instanceof FunctionsHttpError) {
          try {
            const body = await invokeError.context.json();
            code = body?.error;
            const minutes = Number(body?.retry_after_minutes);
            if (Number.isFinite(minutes) && minutes > 0) retryAfterMinutes = minutes;
          } catch {
            // Body wasn't JSON — fall through to the generic message.
          }
        }

        if (code === 'crown_required') {
          setCrownRequired(true);
          return;
        }
        if (code === 'free_limit_reached') {
          // The free-tier RATE ceiling, and the one refusal that must not read
          // like the paywall: it exists to stop scripted abuse, and the sheet
          // is still owed — waiting, not paying, is what actually fixes it.
          // So no Crown pitch here, and no limit numbers either: how many and
          // how often is the server's business, and the only figure repeated
          // is the wait it sent us (absent → describeRetryWait stays vague).
          setError(
            `That's a lot of cheat sheets in a short time, so our AI helper is catching its breath. Nothing is locked and nothing is wrong with your account — please try again ${describeRetryWait(retryAfterMinutes)}.`
          );
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

      // The server tells us which side of the paywall this generation landed
      // on: `watermark: true` means it spent the guide's one free generation,
      // anything else means Crown paid for it. Taking the flag here saves a
      // second round trip to has_crown for the answer the server just gave us.
      // A response with no flag at all reads as "Crown" — the same
      // clean-by-default bias as an unknown entitlement above.
      setHasCrown(data?.watermark !== true);

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
      const body = fillCheatSheetTokens(cheatSheet.content, guide?.home_info);
      // Plain text can't carry the diagonal wash, so the preview state is
      // stated in words instead — and stated as a FEATURE state, never as a
      // doubt about the care details, which are the user's own.
      const filled = watermarked
        ? `${body}\n\n---\nPreview version from Pawstructions. The details above are your own — Pawstructions Crown ($5, one-time) removes the PREVIEW watermark from the app and the PDF.`
        : body;

      if (await copyToClipboard(filled)) {
        showAlert('Copied', 'Cheat sheet copied to clipboard!');
        return;
      }

      // A blocked clipboard must leave a way to get the text OUT. On web the
      // sheet is already rendered on screen and react-native-web leaves text
      // selectable, so manual selection is the honest answer. On native it is
      // not selectable, so the system share sheet — which needs no permission
      // and hands the same text to Messages, Mail or Notes — is the way out.
      if (Platform.OS !== 'web') {
        try {
          await Share.share({ message: filled });
          return;
        } catch {
          // Share unavailable too — fall through to the message below.
        }
      }
      showAlert(
        "Couldn't Copy",
        Platform.OS === 'web'
          ? 'This browser blocked the clipboard. Your cheat sheet is still on the screen behind this message — select the text and copy it by hand.'
          : 'This device blocked the clipboard. Your cheat sheet is still on the screen behind this message, and it is included in the guide PDF.'
      );
    } catch (err) {
      showAlert('Error', 'Failed to copy to clipboard');
    }
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
          showCrownPaywall ? (
            <Card className="items-center py-8 bg-warm-50 border-warm-300">
              <Text className="text-xl font-semibold text-brown-800 mb-2 text-center">
                👑 Pawstructions Crown
              </Text>
              <Text className="text-brown-600 text-center mb-6">
                This guide has already had its free cheat sheet. Crown covers the
                cost of the AI that writes them — $5 once for your whole
                household, not a subscription.
              </Text>
              <View className="w-full gap-3">
                <Button
                  title="👑 Unlock Crown — $5"
                  onPress={() => navigation.navigate('UnlockCrown', { guideId })}
                />
                <Button
                  title="👀 See a Sample Cheat Sheet"
                  onPress={() => navigation.navigate('SampleCheatSheet')}
                  variant="outline"
                />
              </View>
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

              {/* Set the expectation BEFORE the free generation is spent —
                  discovering the watermark afterwards feels like a bait.
                  Phrased without promising THIS sheet is free: the free
                  allowance is one per guide and lives server-side, so the
                  client can't honestly claim this guide still has one. */}
              {watermarked && (
                <Text className="text-brown-600 text-center mb-6">
                  Free cheat sheets arrive with a PREVIEW watermark across them.
                  Crown removes it and lets you rewrite the sheet whenever your
                  details change — $5 once for your whole household.
                </Text>
              )}

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
            <CheatSheetView
              content={cheatSheet.content}
              homeInfo={guide?.home_info}
              generatedAt={cheatSheet.generated_at}
              watermarked={watermarked}
              onUnlockPress={() => navigation.navigate('UnlockCrown', { guideId })}
            />

            {showCrownPaywall ? (
              <Card className="items-center py-8 mb-8 bg-warm-50 border-warm-300">
                <Text className="text-xl font-semibold text-brown-800 mb-2 text-center">
                  👑 Pawstructions Crown
                </Text>
                <Text className="text-brown-600 text-center mb-6">
                  Your free cheat sheet for this guide is above. Crown covers the
                  cost of the AI, so you can rewrite it whenever the details
                  change — $5 once for your whole household, not a subscription.
                </Text>
                <View className="w-full">
                  <Button
                    title="👑 Unlock Crown — $5"
                    onPress={() => navigation.navigate('UnlockCrown', { guideId })}
                  />
                </View>
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
