import { Text, View } from 'react-native';

import type { ScoreEntry } from '../../core/types';

/**
 * Board rows, shared by the home preview and the full board so a run looks
 * identical wherever it shows up.
 */
export function BoardRows({
  entries,
  highlightId,
}: {
  entries: readonly ScoreEntry[];
  highlightId?: string;
}) {
  if (entries.length === 0) {
    return (
      <Text className="text-ink-500 text-sm py-3">
        No runs yet. First one on the board sets the mark.
      </Text>
    );
  }

  return (
    <View className="gap-1">
      {entries.map((entry, index) => {
        const mine = entry.id === highlightId;
        return (
          <View
            key={entry.id}
            accessibilityLabel={`Position ${index + 1}, ${entry.name}, ${entry.score} of ${entry.played}`}
            className={`flex-row items-center gap-3 rounded-xl px-3 py-2.5 ${
              mine ? 'bg-marquee-400/15 border border-marquee-400' : 'bg-ink-800'
            }`}
          >
            <Text
              className={`w-6 text-sm font-bold ${
                index === 0 ? 'text-marquee-400' : 'text-ink-500'
              }`}
            >
              {index + 1}
            </Text>
            <Text className="flex-1 text-white text-sm" numberOfLines={1}>
              {entry.name}
            </Text>
            <Text className="text-ink-400 text-xs">
              {Math.round(entry.durationMs / 1000)}s
            </Text>
            <Text className="text-white text-sm font-bold w-14 text-right">
              {entry.score}
              <Text className="text-ink-500 font-normal">/{entry.played}</Text>
            </Text>
          </View>
        );
      })}
    </View>
  );
}
