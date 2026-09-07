import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { hosted } from './ScreenHost';
import { LandingScreen } from '../screens/LandingScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import type { AuthStackParamList } from './types';

/**
 * Wrapped for the same reason the Main stack is: a native-stack keeps every
 * screen you have visited mounted, and on web their controls stay in the tab
 * order behind the one in front. QA found all ten Landing-screen buttons still
 * reachable from the Login form. This stack was simply missed when the Main
 * one was done — the fix was never Main-specific.
 */
const LandingH = hosted(LandingScreen);
const LoginH = hosted(LoginScreen);
const SignUpH = hosted(SignUpScreen);
const ForgotPasswordH = hosted(ForgotPasswordScreen);

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#FAF6EA' },
      }}
    >
      <Stack.Screen name="Landing" component={LandingH} />
      <Stack.Screen name="Login" component={LoginH} />
      <Stack.Screen name="SignUp" component={SignUpH} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordH} />
    </Stack.Navigator>
  );
}
