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
 * The row is the button; the Switch inside it is decoration that also happens
 * to be draggable.
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
        <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Switch
            value={value}
            onValueChange={onValueChange}
            disabled={disabled}
            trackColor={trackColor}
            thumbColor={thumbColor}
            focusable={false}
          />
        </View>
      </View>
    </Pressable>
  );
}
