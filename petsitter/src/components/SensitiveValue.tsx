import { useState } from 'react';
import { Text, Pressable } from 'react-native';

interface SensitiveValueProps {
  value: string;
  label?: string;
  className?: string;
}

/**
 * Masks sensitive values (WiFi passwords, alarm/door/gate codes) by default.
 * Tap to reveal. Tap again to hide.
 */
export function SensitiveValue({ value, label, className = '' }: SensitiveValueProps) {
  const [revealed, setRevealed] = useState(false);
  const masked = '•'.repeat(Math.max(6, Math.min(value.length, 12)));

  return (
    <Pressable
      onPress={() => setRevealed((v) => !v)}
      accessibilityRole="button"
      accessibilityLabel={revealed ? `Hide ${label || 'sensitive value'}` : `Reveal ${label || 'sensitive value'}`}
      accessibilityState={{ expanded: revealed }}
      className="flex-row items-center"
    >
      <Text className={`text-brown-800 ${className}`} selectable={revealed}>
        {revealed ? value : masked}
      </Text>
      <Text className="text-tan-400 text-xs ml-2">{revealed ? '🙈 Hide' : '👁️ Tap to show'}</Text>
    </Pressable>
  );
}
