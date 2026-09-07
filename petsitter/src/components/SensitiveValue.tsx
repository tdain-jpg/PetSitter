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
  // Fixed width, deliberately unrelated to value.length.
  //
  // This used to be repeat(max(6, min(length, 12))), which clamps at the ends
  // and is therefore exact in between: an 11-character WiFi password rendered
  // exactly 11 dots. Anyone reading over a shoulder — or reading the PUBLIC
  // share page, which needs no login — got the length of the password for
  // free, and length is the one thing that most narrows a guess. The door code
  // beside it was already immune, but only by accident of being short enough
  // to hit the floor of 6.
  const masked = '••••••••';

  return (
    <Pressable
      onPress={() => setRevealed((v) => !v)}
      accessibilityRole="button"
      accessibilityLabel={revealed ? `Hide ${label || 'sensitive value'}` : `Reveal ${label || 'sensitive value'}`}
      accessibilityState={{ expanded: revealed }}
      // 17px tall before this. These are the WiFi password and the door code —
      // the two things a sitter taps one-handed, standing outside a house they
      // have never been to, holding a dog lead.
      style={{ minHeight: 44 }}
      className="flex-row items-center"
    >
      <Text className={`text-brown-800 ${className}`} selectable={revealed}>
        {revealed ? value : masked}
      </Text>
      <Text className="text-tan-400 text-xs ml-2">{revealed ? '🙈 Hide' : '👁️ Tap to show'}</Text>
    </Pressable>
  );
}
