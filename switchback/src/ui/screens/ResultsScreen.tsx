import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { deckById } from '../../core/decks';
import { played, score } from '../../core/round';
import type { RoundState, ScoreEntry } from '../../core/types';
import { leaderboard, settings } from '../../platform/services';
import { BoardRows } from '../components/BoardRows';
import { Button } from '../components/Button';
import { Screen } from '../components/Screen';
import { COLORS } from '../theme';

interface ResultsScreenProps {
  state: RoundState;
  onPlayAgain: () => void;
  onHome: () => void;
}

function headline(state: RoundState, hits: number): string {
  if (state.ending === 'exhausted') return 'Whole deck, cleared.';
  if (state.ending === 'quit') return 'Called it early.';
  if (hits === 0) return "Tough round.";
  return "Time's up.";
}

export function ResultsScreen({
  state,
  onPlayAgain,
  onHome,
}: ResultsScreenProps) {
  const deck = deckById(state.config.deckId);
  const hits = score(state);
  const total = played(state);

  const [name, setName] = useState('');
  const [saved, setSaved] = useState<ScoreEntry | null>(null);
  const [board, setBoard] = useState<ScoreEntry[]>([]);

  useEffect(() => {
    settings.playerName().then(setName);
    leaderboard.top(state.config.deckId).then(setBoard);
  }, [state.config.deckId]);

  const entry = useMemo<ScoreEntry>(
    () => ({
      // Unique per run: two phones saving the same second must not collide.
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim() || 'Anonymous',
      deckId: state.config.deckId,
      score: hits,
      played: total,
      durationMs: state.config.durationMs,
      at: Date.now(),
    }),
    [name, state.config, hits, total],
  );

  const save = useCallback(async () => {
    const next = await leaderboard.submit(entry);
    await settings.setPlayerName(entry.name);
    setBoard(next);
    setSaved(entry);
  }, [entry]);

  const placement = saved
    ? board.findIndex((e) => e.id === saved.id) + 1
    : null;

  return (
    <Screen>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-10 gap-7"
        showsVerticalScrollIndicator={false}
      >
        <View className="pt-8 items-center">
          <Text className="text-ink-400 text-sm">
            {deck?.badge} {deck?.name}
          </Text>
          <Text className="text-white text-2xl font-bold mt-1">
            {headline(state, hits)}
          </Text>
          <Text className="text-marquee-400 text-7xl font-black mt-4">
            {hits}
          </Text>
          <Text className="text-ink-400 text-sm">
            banked from {total} {total === 1 ? 'card' : 'cards'}
          </Text>
        </View>

        {saved ? (
          <View className="items-center gap-1">
            <Text className="text-white text-base font-bold">
              {placement && placement > 0
                ? `#${placement} on the ${deck?.name} board`
                : 'Saved to the board'}
            </Text>
            <Text className="text-ink-500 text-xs">Saved as {saved.name}</Text>
          </View>
        ) : (
          <View className="gap-3">
            <Text className="text-white text-xs font-bold uppercase tracking-widest">
              Put it on the board
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={COLORS.muted}
              maxLength={18}
              accessibilityLabel="Your name"
              returnKeyType="done"
              onSubmitEditing={save}
              className="rounded-2xl border border-ink-600 bg-ink-800 px-4 py-4 text-white text-base"
            />
            <Button label="Save to board" onPress={save} />
          </View>
        )}

        {state.results.length > 0 ? (
          <View className="gap-3">
            <Text className="text-white text-xs font-bold uppercase tracking-widest">
              The round
            </Text>
            <View className="gap-1">
              {state.results.map((result, index) => (
                <View
                  key={`${result.card.id}-${index}`}
                  className="flex-row items-center gap-3 rounded-xl bg-ink-800 px-3 py-2.5"
                >
                  <Text
                    className={`text-sm ${
                      result.verdict === 'hit' ? 'text-hit-400' : 'text-ink-500'
                    }`}
                  >
                    {result.verdict === 'hit' ? '✓' : '–'}
                  </Text>
                  <Text className="flex-1 text-white text-sm" numberOfLines={1}>
                    {result.card.text}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View className="gap-3">
          <Text className="text-white text-xs font-bold uppercase tracking-widest">
            {deck?.name} board
          </Text>
          <BoardRows entries={board.slice(0, 10)} highlightId={saved?.id} />
        </View>

        <View className="gap-3">
          <Button label="Play again" onPress={onPlayAgain} />
          <Button label="Change deck" variant="ghost" onPress={onHome} />
        </View>
      </ScrollView>
    </Screen>
  );
}
