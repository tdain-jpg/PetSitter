import { createElement, useState } from 'react';
import { Platform, View, Text } from 'react-native';
import { COLORS } from '../constants';
import { Input } from './Input';

/**
 * A date input that gives the browser's own calendar picker on web.
 *
 * Dates were plain text fields with a "YYYY-MM-DD" placeholder and a hint
 * reading "Tip: Use format YYYY-MM-DD (e.g., 2026-03-15)". A form that has to
 * explain its own format is a form that will be typed into wrongly, and the
 * only feedback was a validation error after the fact — on a trip form where
 * the dates are the entire point.
 *
 * On web this renders a real `<input type="date">`. react-native-web renders
 * through react-dom, so a DOM element is reachable via createElement; the cast
 * is needed only because React Native's type definitions strip the DOM's
 * intrinsic elements. That one line buys the platform calendar, the platform
 * keyboard on mobile browsers, locale-appropriate display, and the guarantee
 * that whatever comes back is a valid date — none of which we would get right
 * by hand.
 *
 * On native it stays the existing text field. Adding
 * @react-native-community/datetimepicker for a build nobody currently installs
 * (the app ships PWA-first — see ROADMAP §4a) would be a dependency taken on
 * for a hypothetical user. The seam is here when that changes: this is the only
 * file that would need to know.
 *
 * The value is always 'YYYY-MM-DD' or '' in BOTH branches, which is the shape
 * every caller and validator already speaks, and the shape `<input type="date">`
 * natively uses. No parsing, and specifically no `new Date(value)` — that
 * parses a bare date string as UTC midnight and shifts the day backwards for
 * everyone west of Greenwich, which is a bug this codebase has already had once.
 */

interface DateFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  /** 'YYYY-MM-DD'. Web only — the browser greys out earlier dates. */
  min?: string;
  /** 'YYYY-MM-DD'. Web only. */
  max?: string;
  placeholder?: string;
}

export function DateField({
  label,
  value,
  onChange,
  error,
  min,
  max,
  placeholder = 'YYYY-MM-DD',
}: DateFieldProps) {
  const [isFocused, setIsFocused] = useState(false);

  if (Platform.OS !== 'web') {
    return (
      <Input
        label={label}
        placeholder={placeholder}
        value={value}
        onChangeText={onChange}
        error={error}
        autoCapitalize="none"
      />
    );
  }

  // Styled inline rather than with className: this is a DOM node, not a React
  // Native view, so NativeWind's class compilation does not apply to it. The
  // values mirror Input's Tailwind classes (rounded-lg, px-4/py-3, text-base,
  // bg-cream-50, and the same focus/error border colours) so the two sit next
  // to each other in a form without looking like different widgets.
  const borderColor = error
    ? COLORS.accent
    : isFocused
      ? COLORS.primary
      : COLORS.tanLight;

  const input = createElement('input' as any, {
    type: 'date',
    value,
    min,
    max,
    'aria-label': label || placeholder,
    'aria-invalid': error ? true : undefined,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
    style: {
      width: '100%',
      boxSizing: 'border-box',
      // 44px floor for the same reason every other control has one: this is a
      // tap target, and on a phone browser it opens the date picker.
      minHeight: 44,
      padding: '12px 16px',
      fontSize: 16,
      fontFamily: 'inherit',
      color: COLORS.brown,
      backgroundColor: COLORS.creamLight,
      border: `1px solid ${borderColor}`,
      borderRadius: 8,
      outline: 'none',
    },
  });

  return (
    <View className="mb-4">
      {label ? <Text className="text-brown-600 font-medium mb-2">{label}</Text> : null}
      {input}
      {error ? (
        <Text accessibilityLiveRegion="polite" className="text-accent-500 text-sm mt-1">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
