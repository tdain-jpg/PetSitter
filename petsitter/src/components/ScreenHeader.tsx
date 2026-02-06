import { View, Text, Pressable, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../constants';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList } from '../navigation/types';

interface ScreenHeaderProps {
  title: string;
  showBack?: boolean;
  showHome?: boolean;
  backLabel?: string;
  onBack?: () => void;
}

type NavigationProp = NativeStackNavigationProp<MainTabParamList>;

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

  const linkStyle = {
    padding: '8px 12px',
    backgroundColor: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
  };

  if (Platform.OS === 'web') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 48,
          paddingBottom: 16,
          backgroundColor: COLORS.cream,
          borderBottom: `1px solid ${COLORS.creamDark}`,
        }}
      >
        <div style={{ width: 80 }}>
          {showBack && (
            <button
              onClick={handleBack}
              style={{ ...linkStyle, color: COLORS.secondary }}
            >
              {backLabel}
            </button>
          )}
        </div>
        <span
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: COLORS.brown,
            textAlign: 'center',
            flex: 1,
          }}
        >
          {title}
        </span>
        <div style={{ width: 80, display: 'flex', justifyContent: 'flex-end' }}>
          {showHome && (
            <button
              onClick={handleHome}
              style={{ ...linkStyle, color: COLORS.tan }}
            >
              Home
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <View className="flex-row items-center justify-between px-4 pt-12 pb-4 bg-cream-50 border-b border-tan-200">
      <View style={{ width: 80 }}>
        {showBack && (
          <Pressable onPress={handleBack} className="py-2">
            <Text className="text-secondary-600 text-sm">{backLabel}</Text>
          </Pressable>
        )}
      </View>
      <Text className="text-lg font-semibold text-brown-800 flex-1 text-center">
        {title}
      </Text>
      <View style={{ width: 80, alignItems: 'flex-end' }}>
        {showHome && (
          <Pressable onPress={handleHome} className="py-2">
            <Text className="text-tan-500 text-sm">Home</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
