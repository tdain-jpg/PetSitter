import { Pressable, Text, View } from 'react-native';

type Variant = 'primary' | 'ghost' | 'quiet';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
}

const SURFACE: Record<Variant, string> = {
  primary: 'bg-marquee-400 border-marquee-300',
  ghost: 'bg-ink-700 border-ink-600',
  quiet: 'bg-transparent border-transparent',
};

const LABEL: Record<Variant, string> = {
  primary: 'text-ink-900',
  ghost: 'text-white',
  quiet: 'text-ink-400',
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={onPress}
      className={disabled ? 'opacity-40' : 'active:opacity-80'}
    >
      <View
        className={`rounded-2xl border px-6 py-4 items-center ${SURFACE[variant]}`}
      >
        <Text
          className={`text-base font-bold tracking-wide ${LABEL[variant]}`}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
