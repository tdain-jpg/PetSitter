import { Pressable, Text, View } from 'react-native';

interface Option<T> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T> {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: SegmentedControlProps<T>) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      className="flex-row rounded-xl bg-ink-800 border border-ink-600 p-1"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            accessibilityRole="radio"
            aria-checked={selected}
            onPress={() => onChange(option.value)}
            className={`flex-1 rounded-lg py-2.5 items-center ${
              selected ? 'bg-marquee-400' : ''
            }`}
          >
            <Text
              className={`text-sm font-semibold ${
                selected ? 'text-ink-900' : 'text-ink-400'
              }`}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
