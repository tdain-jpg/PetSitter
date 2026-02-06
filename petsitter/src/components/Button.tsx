import { View, Text, ActivityIndicator, Platform, Pressable } from 'react-native';

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
  goldDark: '#A67432',
  brown: '#5D4037',
  brownDark: '#4A3328',
  cream: '#FAF3E3',
  red: '#B84233',
  redDark: '#9A3529',
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
  const borderStyle = variant === 'outline' ? `2px solid ${COLORS.gold}` : 'none';

  // For web, render a native button for reliable click handling
  if (Platform.OS === 'web') {
    return (
      <button
        onClick={isDisabled ? undefined : onPress}
        disabled={isDisabled}
        style={{
          backgroundColor: bgColor,
          color: textColor,
          border: borderStyle,
          padding: '12px 24px',
          borderRadius: 8,
          fontSize: 16,
          fontWeight: 600,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.5 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        {loading ? 'Loading...' : title}
      </button>
    );
  }

  // For native platforms, use Pressable
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
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
