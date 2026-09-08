import { createElement, useState } from 'react';
import { Platform, View, Text } from 'react-native';
import { COLORS } from '../constants';
import { Input } from './Input';
import { parseHour24 } from '../lib/routineTasks';

/**
 * A time input that gives the browser's own time picker on web.
 *
 * WHY THIS EXISTS, AND IT IS NOT TIDINESS. Times were free text with an
 * "08:00" placeholder and no validation, so "7:30 PM", "7.30pm", "half seven"
 * and "19:30" were all equally acceptable to the form. The checklist then read
 * the hour with parseInt, which sees 7 in "7:30 PM" and filed an evening
 * medication under Morning. That parser is now robust, but a robust parser is a
 * repair; this is the fix. `<input type="time">` cannot return an ambiguous
 * string.
 *
 * Sibling of DateField and deliberately identical in approach: react-native-web
 * renders through react-dom, so a real DOM element is reachable through
 * createElement, and the cast exists only because React Native's types strip
 * the DOM's intrinsic elements. That buys the platform picker, the platform
 * keyboard on a phone browser, locale-appropriate display (a US browser shows
 * AM/PM, a European one 24-hour) and a guarantee about what comes back.
 *
 * THE STORED VALUE IS ALWAYS 24-HOUR 'HH:MM' or ''. That is what
 * `<input type="time">` uses natively, and what every reader in this codebase
 * already handles correctly. What the user SEES is their locale's convention;
 * what we store never varies.
 *
 * Legacy values are migrated on display rather than in the database. A pet
 * whose feeding says "7:30 AM" is normalised to "07:30" for the element, so the
 * picker opens on the right time instead of blank; anything genuinely
 * unparseable is left for the user to set rather than guessed at.
 *
 * On native this stays a text field, matching DateField's reasoning: adding a
 * picker dependency for a build nobody currently installs would be weight taken
 * on for a hypothetical user, and this file is the only seam that would need to
 * know when that changes.
 */

interface TimeFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  placeholder?: string;
}

/** Any historical spelling of a time to the 'HH:MM' the element requires. */
export function toTimeInputValue(raw: string): string {
  if (!raw) return '';
  if (/^\d{2}:\d{2}$/.test(raw.trim())) return raw.trim();
  const hour = parseHour24(raw);
  if (hour === null) return '';
  const minute = raw.trim().match(/:(\d{2})/)?.[1] ?? '00';
  return `${String(hour).padStart(2, '0')}:${minute}`;
}

export function TimeField({
  label,
  value,
  onChange,
  error,
  placeholder = '08:00',
}: TimeFieldProps) {
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

  // Styled inline, not with className: this is a DOM node, so NativeWind's
  // class compilation does not reach it. The values mirror Input's Tailwind so
  // the two sit side by side in a form without looking like different widgets.
  const borderColor = error ? COLORS.accent : isFocused ? COLORS.primary : COLORS.tanLight;

  const input = createElement('input' as any, {
    type: 'time',
    value: toTimeInputValue(value),
    'aria-label': label || placeholder,
    'aria-invalid': error ? true : undefined,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    onFocus: () => {
      setIsFocused(true);
      // An empty time input opens its picker at the CURRENT time, so adding a
      // feeding at 2:54pm proposed 2:54pm — a number with no meaning that is
      // one careless tap from being saved. Noon is a neutral starting point
      // that nobody will mistake for a real answer.
      if (!toTimeInputValue(value)) onChange('12:00');
    },
    onBlur: () => setIsFocused(false),
    style: {
      width: '100%',
      boxSizing: 'border-box',
      // 44px floor: this is a tap target, and on a phone it opens the picker.
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
