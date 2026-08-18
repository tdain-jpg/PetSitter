import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DECKS, deckById } from '../../core/decks';
import { currentCard, score } from '../../core/round';
import type { RoundState } from '../../core/types';
import { COLORS } from '../theme';
import { useRound } from '../hooks/useRound';

interface PlayScreenProps {
  deckId: string;
  durationMs: number;
  tiltEnabled: boolean;
  onFinished: (state: RoundState) => void;
  onQuit: () => void;
}

/** Big text reads from across a queue; long prompts get stepped down. */
function promptSize(text: string): number {
  if (text.length > 24) return 38;
  if (text.length > 15) return 50;
  return 62;
}

export function PlayScreen({
  deckId,
  durationMs,
  tiltEnabled,
  onFinished,
  onQuit,
}: PlayScreenProps) {
  // Fall back rather than render nothing: hooks below must run unconditionally.
  const deck = deckById(deckId) ?? DECKS[0];
  const round = useRound({
    deck,
    durationMs,
    tiltEnabled,
    onFinished,
  });

  const { state, flash, countdown, secondsLeft, markCard } = round;
  const card = currentCard(state);

  // Ending mid-round keeps what you banked, so it routes to results like any
  // other finish. Cancelling during the countdown banked nothing, so it just
  // backs out to the deck picker.
  const endRound = useCallback(() => {
    round.abandon();
  }, [round]);

  const surface =
    flash === 'hit' ? COLORS.hit : flash === 'pass' ? COLORS.skip : COLORS.page;

  if (state.phase === 'countdown') {
    return (
      <View
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: COLORS.page }}
      >
        <Text className="text-ink-400 text-base text-center">
          {tiltEnabled
            ? 'Phone flat on your forehead, screen facing everyone else.'
            : 'Hold the phone up so the room can read it.'}
        </Text>
        <Text className="text-marquee-400 text-8xl font-black my-6">
          {countdown}
        </Text>
        <Text className="text-white text-lg font-bold text-center">
          {deck.badge} {deck.name}
        </Text>
        <Pressable
          onPress={onQuit}
          accessibilityRole="button"
          className="absolute bottom-10"
        >
          <Text className="text-ink-500 text-sm">Cancel</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: surface }}>
      {/* Tap zones sit underneath everything: top half passes, bottom banks. */}
      <View style={StyleSheet.absoluteFill} className="flex-col">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pass"
          className="flex-1"
          onPress={() => markCard('pass')}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Got it"
          className="flex-1"
          onPress={() => markCard('hit')}
        />
      </View>

      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <View className="flex-1 px-6 pt-14 pb-10 items-center justify-between">
          <View className="flex-row items-center gap-4">
            <Text
              className={`text-2xl font-black ${
                secondsLeft <= 10 && !flash ? 'text-skip-400' : 'text-white'
              }`}
            >
              {secondsLeft}
            </Text>
            <Text className="text-white/60 text-sm font-semibold">
              {score(state)} banked
            </Text>
          </View>

          <View className="flex-1 justify-center items-center px-2">
            {flash ? (
              <Text className="text-white text-6xl font-black tracking-tight">
                {flash === 'hit' ? 'GOT IT' : 'PASS'}
              </Text>
            ) : (
              <>
                <Text
                  className="text-white font-black text-center leading-tight"
                  style={{ fontSize: promptSize(card?.text ?? '') }}
                >
                  {card?.text ?? ''}
                </Text>
                {card?.hint ? (
                  <Text className="text-ink-400 text-sm text-center mt-5">
                    {card.hint}
                  </Text>
                ) : null}
              </>
            )}
          </View>

          {flash ? (
            <View className="h-5" />
          ) : (
            <Text className="text-white/40 text-xs text-center">
              {tiltEnabled
                ? 'Tip down to bank it · tip up to pass'
                : 'Tap the bottom to bank it · tap the top to pass'}
            </Text>
          )}
        </View>
      </View>

      <Pressable
        onPress={endRound}
        accessibilityRole="button"
        accessibilityLabel="End round"
        className="absolute top-12 right-5 px-3 py-2"
      >
        <Text className="text-white/50 text-sm font-semibold">End</Text>
      </Pressable>
    </View>
  );
}
