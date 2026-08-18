import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { DECKS, deckById } from '../../core/decks';
import { DURATION_CHOICES_MS } from '../../core/round';
import type { ScoreEntry } from '../../core/types';
import { leaderboard } from '../../platform/services';
import { tiltSensor } from '../../platform/tiltSensor';
import { BoardRows } from '../components/BoardRows';
import { Button } from '../components/Button';
import { DeckTile } from '../components/DeckTile';
import { Screen } from '../components/Screen';
import { SegmentedControl } from '../components/SegmentedControl';

interface HomeScreenProps {
  deckId: string;
  durationMs: number;
  tiltEnabled: boolean;
  onSelectDeck: (deckId: string) => void;
  onChangeDuration: (durationMs: number) => void;
  onSetTilt: (enabled: boolean) => void;
  onStart: () => void;
  onOpenBoard: () => void;
  /** Bumped after a round so the preview refetches. */
  boardVersion: number;
}

const DURATION_OPTIONS = DURATION_CHOICES_MS.map((ms) => ({
  value: ms,
  label: `${ms / 1000}s`,
}));

export function HomeScreen({
  deckId,
  durationMs,
  tiltEnabled,
  onSelectDeck,
  onChangeDuration,
  onSetTilt,
  onStart,
  onOpenBoard,
  boardVersion,
}: HomeScreenProps) {
  const deck = deckById(deckId) ?? DECKS[0];
  const [preview, setPreview] = useState<ScoreEntry[]>([]);
  const [tiltNote, setTiltNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    leaderboard.top(deck.id).then((entries) => {
      if (live) setPreview(entries.slice(0, 3));
    });
    return () => {
      live = false;
    };
  }, [deck.id, boardVersion]);

  // iOS only hands out motion data if the request happens inside a user
  // gesture, so the permission prompt lives on this toggle and nowhere else.
  const toggleTilt = useCallback(async () => {
    if (tiltEnabled) {
      onSetTilt(false);
      setTiltNote(null);
      return;
    }
    if (!tiltSensor.available) {
      setTiltNote('This device has no motion sensor. Tap controls it is.');
      return;
    }
    const permission = await tiltSensor.request();
    if (permission === 'granted') {
      onSetTilt(true);
      setTiltNote(null);
    } else {
      onSetTilt(false);
      setTiltNote(
        permission === 'denied'
          ? 'Motion access was declined. You can still tap to score.'
          : 'Motion is unavailable here. You can still tap to score.',
      );
    }
  }, [tiltEnabled, onSetTilt]);

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-10 gap-7"
        showsVerticalScrollIndicator={false}
      >
        <View className="pt-6">
          <Text className="text-marquee-400 text-4xl font-black tracking-tight">
            SWITCHBACK
          </Text>
          <Text className="text-ink-400 text-sm mt-1">
            Park charades for the standby line.
          </Text>
        </View>

        <View className="gap-3">
          <Text className="text-white text-xs font-bold uppercase tracking-widest">
            Deck
          </Text>
          <View accessibilityRole="radiogroup" className="gap-2">
            {DECKS.map((d) => (
              <DeckTile
                key={d.id}
                deck={d}
                selected={d.id === deck.id}
                onPress={() => onSelectDeck(d.id)}
              />
            ))}
          </View>
        </View>

        <View className="gap-3">
          <Text className="text-white text-xs font-bold uppercase tracking-widest">
            Round length
          </Text>
          <SegmentedControl
            label="Round length"
            options={DURATION_OPTIONS}
            value={durationMs}
            onChange={onChangeDuration}
          />
        </View>

        <View className="gap-3">
          <Text className="text-white text-xs font-bold uppercase tracking-widest">
            Controls
          </Text>
          <Pressable
            accessibilityRole="switch"
            aria-checked={tiltEnabled}
            accessibilityLabel="Tilt to score"
            onPress={toggleTilt}
            className="active:opacity-80"
          >
            <View
              className={`flex-row items-center gap-4 rounded-2xl border p-4 ${
                tiltEnabled
                  ? 'border-marquee-400 bg-ink-700'
                  : 'border-ink-600 bg-ink-800'
              }`}
            >
              <Text className="text-2xl">📱</Text>
              <View className="flex-1">
                <Text className="text-white text-sm font-bold">
                  Tilt to score
                </Text>
                <Text className="text-ink-400 text-xs mt-0.5">
                  Phone on your forehead. Tip down for got it, up to pass.
                </Text>
              </View>
              <View
                className={`w-11 h-6 rounded-full justify-center px-0.5 ${
                  tiltEnabled ? 'bg-marquee-400 items-end' : 'bg-ink-600 items-start'
                }`}
              >
                <View className="w-5 h-5 rounded-full bg-white" />
              </View>
            </View>
          </Pressable>
          {tiltNote ? (
            <Text className="text-skip-400 text-xs">{tiltNote}</Text>
          ) : (
            <Text className="text-ink-500 text-xs">
              Off means tap the bottom of the screen for got it, the top to pass.
            </Text>
          )}
        </View>

        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <Text className="text-white text-xs font-bold uppercase tracking-widest">
              {deck.name} board
            </Text>
            <Pressable onPress={onOpenBoard} accessibilityRole="button">
              <Text className="text-marquee-400 text-xs font-semibold">
                See all
              </Text>
            </Pressable>
          </View>
          <BoardRows entries={preview} />
        </View>

        <Button label={`Start ${deck.name}`} onPress={onStart} />
      </ScrollView>
    </Screen>
  );
}
