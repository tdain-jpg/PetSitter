import { Pressable, Text, View } from 'react-native';

import type { Deck } from '../../core/types';

interface DeckTileProps {
  deck: Deck;
  selected: boolean;
  onPress: () => void;
}

export function DeckTile({ deck, selected, onPress }: DeckTileProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      // aria-* rather than accessibilityState: React Native Web drops the
      // latter on Pressable, and these map back to it on native anyway.
      aria-checked={selected}
      accessibilityLabel={`${deck.name}. ${deck.tagline}`}
      onPress={onPress}
      className="active:opacity-80"
    >
      <View
        className={`flex-row items-center gap-4 rounded-2xl border p-4 ${
          selected
            ? 'border-marquee-400 bg-ink-700'
            : 'border-ink-600 bg-ink-800'
        }`}
      >
        <Text className="text-3xl">{deck.badge}</Text>
        <View className="flex-1">
          <Text className="text-white text-base font-bold">{deck.name}</Text>
          <Text className="text-ink-400 text-xs mt-0.5">{deck.tagline}</Text>
        </View>
        <Text className="text-ink-500 text-xs font-semibold">
          {deck.cards.length}
        </Text>
      </View>
    </Pressable>
  );
}
