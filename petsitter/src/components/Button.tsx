import { Text, ActivityIndicator, Pressable } from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}

// Color palette from logo
const COLORS = {
  gold: '#C4913D',
  brown: '#5D4037',
  red: '#B84233',
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const bgColor = {
    primary: COLORS.gold,
    secondary: COLORS.brown,
    outline: 'transparent',
    danger: COLORS.red,
  }[variant];

  const textColor = variant === 'outline' ? COLORS.gold : '#ffffff';
  const borderColor = variant === 'outline' ? COLORS.gold : variant === 'danger' ? COLORS.red : COLORS.gold;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={{
        backgroundColor: bgColor,
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isDisabled ? 0.5 : 1,
        borderWidth: variant === 'outline' ? 2 : 0,
        borderColor: borderColor,
      }}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={{ color: textColor, fontSize: 16, fontWeight: '600' }}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}
