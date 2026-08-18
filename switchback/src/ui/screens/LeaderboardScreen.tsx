import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { DECKS, deckById } from '../../core/decks';
import type { ScoreEntry } from '../../core/types';
import { leaderboard } from '../../platform/services';
import { BoardRows } from '../components/BoardRows';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';

interface LeaderboardScreenProps {
  deckId: string;
  onSelectDeck: (deckId: string) => void;
  onBack: () => void;
}

export function LeaderboardScreen({
  deckId,
  onSelectDeck,
  onBack,
}: LeaderboardScreenProps) {
  const deck = deckById(deckId) ?? DECKS[0];
  const [entries, setEntries] = useState<ScoreEntry[]>([]);
  const [confirmingClear, setConfirmingClear] = useState(false);

  const load = useCallback(() => {
    leaderboard.top(deck.id).then(setEntries);
  }, [deck.id]);

  useEffect(() => {
    setConfirmingClear(false);
    load();
  }, [load]);

  const clear = useCallback(async () => {
    // Two taps, because wiping the board is not undoable.
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    await leaderboard.clear(deck.id);
    setConfirmingClear(false);
    load();
  }, [confirmingClear, deck.id, load]);

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-10 gap-6"
        showsVerticalScrollIndicator={false}
      >
        <View className="pt-6 flex-row items-center justify-between">
          <Text className="text-white text-2xl font-black">Leaderboard</Text>
          <Pressable onPress={onBack} accessibilityRole="button">
            <Text className="text-marquee-400 text-sm font-semibold">Done</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 pr-5"
        >
          {DECKS.map((d) => {
            const selected = d.id === deck.id;
            return (
              <Pressable
                key={d.id}
                accessibilityRole="tab"
                aria-selected={selected}
                onPress={() => onSelectDeck(d.id)}
              >
                <View
                  className={`rounded-full border px-4 py-2 ${
                    selected
                      ? 'border-marquee-400 bg-marquee-400'
                      : 'border-ink-600 bg-ink-800'
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      selected ? 'text-ink-900' : 'text-ink-400'
                    }`}
                  >
                    {d.badge} {d.name}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <BoardRows entries={entries} />

        {entries.length > 0 ? (
          <Button
            label={confirmingClear ? 'Tap again to wipe it' : 'Clear this board'}
            variant="quiet"
            onPress={clear}
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}
