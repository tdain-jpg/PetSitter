import { View, Text } from 'react-native';
import { Button } from './Button';
import { safeGoBack } from '../lib/goBack';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

/**
 * The one screen header, and it now looks like the majority did.
 *
 * There were two patterns. Nine screens used this component, which rendered a
 * small text arrow pinned to the left edge with a centred title. Seventeen
 * hand-rolled `<Button title="← Back" variant="outline">` above the content.
 * Same behaviour — both call safeGoBack — but visibly different controls in the
 * same app, which is what got reported.
 *
 * Unified by changing the NINE to match the SEVENTEEN rather than the other way
 * round. Converting seventeen bespoke headers would have meant rewriting the
 * layout of the most-used screens in the app, several of which carry a
 * right-hand action this component has no slot for, to fix something purely
 * visual. One file, no layout risk on the screens that were already right.
 *
 * The title moves below the buttons and grows, matching the hand-rolled
 * headers, which put a large left-aligned title under the controls.
 */
interface ScreenHeaderProps {
  title: string;
  showBack?: boolean;
  showHome?: boolean;
  backLabel?: string;
  onBack?: () => void;
}

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

export function ScreenHeader({
  title,
  showBack = true,
  showHome = true,
  backLabel = '← Back',
  onBack,
}: ScreenHeaderProps) {
  const navigation = useNavigation<NavigationProp>();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      safeGoBack(navigation);
    }
  };

  const handleHome = () => {
    navigation.navigate('Home');
  };

  return (
    <View className="px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
      <View className="flex-row items-center justify-between">
        {showBack ? (
          <Button title={backLabel} onPress={handleBack} variant="outline" />
        ) : (
          <View />
        )}
        {showHome ? (
          <Button title="Home" onPress={handleHome} variant="outline" />
        ) : (
          <View />
        )}
      </View>
      <Text
        accessibilityRole="header"
        className="text-2xl font-bold text-brown-800 mt-4"
      >
        {title}
      </Text>
    </View>
  );
}
