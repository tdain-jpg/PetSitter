import { View, Text, ActivityIndicator, Platform, Pressable } from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
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
    primary: '#2563eb',
    secondary: '#4b5563',
    outline: 'transparent',
  }[variant];

  const textColor = variant === 'outline' ? '#2563eb' : '#ffffff';
  const borderStyle = variant === 'outline' ? '2px solid #2563eb' : 'none';

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
        borderColor: '#2563eb',
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
