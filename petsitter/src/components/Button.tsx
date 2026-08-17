import { Text, ActivityIndicator, Pressable } from 'react-native';
import { COLORS } from '../constants';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  disabled?: boolean;
  loading?: boolean;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const bgColor = {
    primary: COLORS.primary,
    secondary: COLORS.secondary,
    outline: 'transparent',
    danger: COLORS.error,
  }[variant];

  const textColor = variant === 'outline' ? COLORS.primaryDark : COLORS.white;
  const borderColor = variant === 'outline' ? COLORS.primary : variant === 'danger' ? COLORS.error : COLORS.primary;

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
        // 12 + 12 + a 19px line box lands on 43 — one pixel under every
        // accessible-tap-target guideline there is, on EVERY button in the app.
        // A floor is the fix rather than more padding, because padding stops
        // being right the moment the text scales.
        minHeight: 44,
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
