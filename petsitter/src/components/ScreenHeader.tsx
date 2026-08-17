import { View, Text, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/types';

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
      navigation.goBack();
    }
  };

  const handleHome = () => {
    navigation.navigate('Home');
  };

  return (
    <View className="flex-row items-center justify-between px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
      <View style={{ width: 80 }}>
        {showBack && (
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text className="text-secondary-600 text-sm">{backLabel}</Text>
          </Pressable>
        )}
      </View>
      <Text
        accessibilityRole="header"
        className="text-lg font-semibold text-brown-800 flex-1 text-center"
      >
        {title}
      </Text>
      <View style={{ width: 80, alignItems: 'flex-end' }}>
        {showHome && (
          <Pressable
            onPress={handleHome}
            accessibilityRole="button"
            accessibilityLabel="Go to home"
            style={{ minHeight: 44, justifyContent: 'center' }}
          >
            <Text className="text-tan-500 text-sm">Home</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
