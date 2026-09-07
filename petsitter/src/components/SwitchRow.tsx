import { View, Text, Pressable, Switch } from 'react-native';

/**
 * A labelled row wrapping a Switch, where the WHOLE ROW is the tap target.
 *
 * A bare `<Switch>` renders 40x20 on web — half the 44px accessibility floor —
 * and the label beside it is dead text. QA measured fifteen of them across
 * PetForm, GuideForm, PDFPreview, Settings, TripWizard and the symptom checker,
 * including twelve health-alert toggles stacked on one screen. Missing one with
 * a thumb is not a cosmetic problem there: it silently arms or disarms an alert
 * about somebody's animal.
 *
 * The row is the button. The Switch inside it is DECORATION ONLY — it does not
 * handle its own interaction, and it must not.
 *
 * THE BUG THAT TAUGHT US THIS. The first version left `onValueChange` on the
 * inner Switch as well. Clicking the label worked, because only the Pressable
 * saw it. Clicking the switch itself did nothing at all: the Switch flipped the
 * value, the same click then bubbled to the Pressable, and the Pressable
 * flipped it back. Two handlers, one click, net zero — a control that visibly
 * twitched and then refused. QA found it on the PDF export toggles and on a
 * pet's Spayed/Neutered flag, where the form's autosave then reported
 * "Last saved" over a value that had never changed. Every switch in the app is
 * this component, so every switch in the app was dead on the thumb.
 *
 * Hence both halves below: the Switch has no handler, and the wrapper stops
 * pointer events so the click reaches the row instead of being eaten by the
 * input. Do not give the inner Switch an onValueChange again.
 */
interface SwitchRowProps {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  /** Optional second line, smaller and muted. */
  description?: string;
  disabled?: boolean;
  /** Renders the label muted + struck through when the switch is off. */
  strikeThroughWhenOff?: boolean;
  className?: string;
  /** Passed through so call sites that themed their Switch keep their look. */
  trackColor?: { false?: string; true?: string };
  thumbColor?: string;
}

export function SwitchRow({
  label,
  value,
  onValueChange,
  description,
  disabled = false,
  strikeThroughWhenOff = false,
  className = '',
  trackColor,
  thumbColor,
}: SwitchRowProps) {
  const handlePress = () => {
    if (!disabled) onValueChange(!value);
  };

  const labelClass =
    strikeThroughWhenOff && !value ? 'text-tan-500 line-through' : 'text-brown-800';

  return (
    <Pressable
      onPress={handlePress}
      // justifyContent alongside minHeight: without it the content pins to the
      // top of the 44px box and the row reads as misaligned next to any
      // neighbour that isn't padded the same way.
      style={{ minHeight: 44, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      // accessibilityState alone does NOT reach the DOM on react-native-web —
      // measured: the row rendered role="switch" with no aria-checked at all,
      // so a screen reader announced "Auto-Save, switch" and never said whether
      // it was on. The aria-* props are the web half of the same statement.
      aria-checked={value}
      aria-disabled={disabled || undefined}
      accessibilityLabel={description ? `${label}. ${description}` : label}
      className={className}
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-1 mr-3">
          {/* Deliberately NOT numberOfLines={1}. Several of these labels are
              health symptoms ("Vomiting more than twice in a day"); a wrapped
              label is fine, a truncated one loses the thing being asked. */}
          <Text className={labelClass}>{label}</Text>
          {description ? <Text className="text-tan-500 text-sm">{description}</Text> : null}
        </View>
        {/* Hidden from assistive tech so the row announces ONCE. Without this a
            screen reader reads the Pressable's switch role and then the inner
            Switch's, as two separate controls for one setting.
            accessibilityElementsHidden and importantForAccessibility are
            NATIVE-ONLY — react-native-web drops both, and the inner input was
            measured still carrying role="switch". aria-hidden is what actually
            does the work on web; the native props stay for iOS and Android. */}
        <View
          aria-hidden
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          // The click belongs to the row. Without this the inner input consumes
          // it and re-emits its own change, which is half of the double-toggle
          // described above; the row's handler is the single source of truth.
          pointerEvents="none"
        >
          <Switch
            value={value}
            disabled={disabled}
            trackColor={trackColor}
            thumbColor={thumbColor}
            focusable={false}
            // focusable={false} does NOT emit tabindex="-1" on
            // react-native-web — measured: the inner input had no tabindex at
            // all, so it stayed in sequential tab order INSIDE an aria-hidden
            // wrapper. That is the axe `aria-hidden-focus` violation, and on
            // PetForm it meant 26 tab stops for 13 settings, every other one
            // landing on a control with no accessible name.
            tabIndex={-1}
          />
        </View>
      </View>
    </Pressable>
  );
}
