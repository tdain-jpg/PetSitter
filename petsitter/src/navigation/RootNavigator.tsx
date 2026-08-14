import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthNavigator } from './AuthNavigator';
import { MainNavigator } from './MainNavigator';
import { SharedGuideViewScreen } from '../screens/SharedGuideViewScreen';
import { InstallScreen } from '../screens/InstallScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';
import { useAuth } from '../contexts/AuthContext';
import { View, ActivityIndicator } from 'react-native';
import { COLORS } from '../constants';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { isAuthenticated, isLoading, isPasswordRecovery } = useAuth();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-cream-200">
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // A password-recovery link lands the user here with a recovery session.
  // Show only the reset screen until the flow completes — rendering the
  // normal stacks would drop them into the app with a half-authenticated
  // session and no way to set the new password.
  if (isPasswordRecovery) {
    return <ResetPasswordScreen />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <Stack.Screen name="Main" component={MainNavigator} />
      ) : (
        <Stack.Screen name="Auth" component={AuthNavigator} />
      )}
      {/* Publicly accessible regardless of auth state */}
      <Stack.Screen name="SharedGuideView" component={SharedGuideViewScreen} />
      <Stack.Screen name="Install" component={InstallScreen} />
    </Stack.Navigator>
  );
}
