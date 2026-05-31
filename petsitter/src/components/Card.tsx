import { View, Pressable } from 'react-native';
import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  className?: string;
  accessibilityLabel?: string;
}

export function Card({ children, onPress, className = '', accessibilityLabel }: CardProps) {
  const baseStyles = 'bg-cream-50 rounded-xl p-4 shadow-sm border border-tan-200';

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        className={`${baseStyles} active:opacity-80 ${className}`}
      >
        {children}
      </Pressable>
    );
  }

  return <View className={`${baseStyles} ${className}`}>{children}</View>;
}
