import { useEffect, useRef } from 'react';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthNavigator } from './AuthNavigator';
import { MainNavigator } from './MainNavigator';
import { SharedGuideViewScreen } from '../screens/SharedGuideViewScreen';
import { InstallScreen } from '../screens/InstallScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';
import { AboutScreen } from '../screens/AboutScreen';
import { PrivacyScreen } from '../screens/PrivacyScreen';
import { TermsScreen } from '../screens/TermsScreen';
import { RefundScreen } from '../screens/RefundScreen';
import { useAuth } from '../contexts/AuthContext';
import { View, ActivityIndicator } from 'react-native';
import { COLORS } from '../constants';
import type { MainStackParamList, RootStackParamList } from './types';

// ---------------------------------------------------------------------------
// Web deep-link restore
//
// On web, hard-loading an authed URL like /Main/PetDetail?petId=... lands on
// /Main/Home: the authed stack mounts only after the Supabase session is
// restored, and by then the initial URL is gone. Capture the location ONCE at
// module load and, once auth resolves, replay it for a small whitelist of
// detail routes by navigating from the freshly-mounted Home (so back returns
// to Home). Public routes (/share/:code, /install) resolve while signed out
// via the linking config and are untouched by this. Native never runs any of
// it — pendingWebPath stays null without a window.
// ---------------------------------------------------------------------------

let pendingWebPath: string | null =
  typeof window !== 'undefined' && window.location
    ? `${window.location.pathname}${window.location.search}`
    : null;

type RestoredParams = { params: object | undefined };
type ParamParser = (query: URLSearchParams) => RestoredParams | null;

const noParams: ParamParser = () => ({ params: undefined });

const guideParams: ParamParser = (query) => {
  const guideId = query.get('guideId');
  return guideId ? { params: { guideId } } : null;
};

// Only parameterized detail routes (plus their list/settings anchors and the
// Stripe checkout return) are worth restoring after a hard reload. Anything
// else under /Main/ (Onboarding, TripWizard, ...) falls through to Home.
const RESTORABLE_MAIN_ROUTES: Partial<Record<keyof MainStackParamList, ParamParser>> = {
  Pets: noParams,
  Guides: noParams,
  Settings: noParams,
  Household: noParams,
  PetDetail: (query) => {
    const petId = query.get('petId');
    return petId ? { params: { petId } } : null;
  },
  GuideDetail: guideParams,
  DailyRoutine: guideParams,
  HomeCare: guideParams,
  ShareGuide: guideParams,
  PDFPreview: guideParams,
  AICheatSheet: guideParams,
  // Where Stripe sends the buyer back to. On web that return is a hard page
  // load, so this entry is the only thing standing between a paid customer and
  // being dumped on Home with no confirmation — hence it ALWAYS returns params
  // rather than following guideParams and dropping the route when there is no
  // guideId: a purchase started from Settings legitimately has none. `checkout`
  // is matched against the two values create-checkout-session can send instead
  // of being forwarded verbatim, so arbitrary query text never reaches
  // route.params.
  UnlockCrown: (query) => {
    const checkout = query.get('checkout');
    const guideId = query.get('guideId');
    return {
      params: {
        ...(checkout === 'success' || checkout === 'cancelled' ? { checkout } : {}),
        ...(guideId ? { guideId } : {}),
      },
    };
  },
  PetForm: (query) => {
    const mode = query.get('mode');
    if (mode === 'create') return { params: { mode } };
    const petId = query.get('petId');
    if (mode === 'edit' && petId) return { params: { mode, petId } };
    return null;
  },
  GuideForm: (query) => {
    const mode = query.get('mode');
    if (mode === 'create') return { params: { mode } };
    const guideId = query.get('guideId');
    if (mode === 'edit' && guideId) return { params: { mode, guideId } };
    return null;
  },
};

/** Consume the captured URL; returns a route only for whitelisted /Main/ paths. */
function consumePendingMainRoute(): {
  name: keyof MainStackParamList;
  params: object | undefined;
} | null {
  const captured = pendingWebPath;
  pendingWebPath = null;
  if (!captured || !captured.startsWith('/Main/')) return null;

  const queryIndex = captured.indexOf('?');
  const pathname = queryIndex === -1 ? captured : captured.slice(0, queryIndex);
  const search = queryIndex === -1 ? '' : captured.slice(queryIndex);

  const segments = pathname.split('/').filter(Boolean); // e.g. ['Main', 'PetDetail']
  if (segments.length !== 2) return null;

  const parse = RESTORABLE_MAIN_ROUTES[segments[1] as keyof MainStackParamList];
  if (!parse) return null;

  const parsed = parse(new URLSearchParams(search));
  if (!parsed) return null;

  return { name: segments[1] as keyof MainStackParamList, params: parsed.params };
}

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { isAuthenticated, isLoading, isPasswordRecovery } = useAuth();
  // Outside a screen this resolves to the NavigationContainer ref — fine for
  // dispatching once the authed stack has mounted.
  const navigation = useNavigation();
  const restoredDeepLink = useRef(false);

  useEffect(() => {
    // Run once, only after auth has resolved to a signed-in, non-recovery
    // session — the Main stack is mounted (on Home) by the time effects fire.
    if (isLoading || !isAuthenticated || isPasswordRecovery) return;
    if (restoredDeepLink.current) return;
    restoredDeepLink.current = true;

    const route = consumePendingMainRoute();
    if (!route) return;

    navigation.dispatch(
      CommonActions.navigate({
        name: 'Main',
        params: { screen: route.name, params: route.params },
      })
    );
  }, [isLoading, isAuthenticated, isPasswordRecovery, navigation]);

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
      {/* Publicly accessible regardless of auth state.
          Sitters open share links without an account, and anyone can read the
          install instructions. The four trust pages sit here for a related
          reason: Stripe will not activate a live account until its reviewer
          can reach a service description, terms, privacy policy and refund
          policy, and that reviewer has no login. Registering them outside the
          isAuthenticated branch is what makes /about, /privacy, /terms and
          /refunds resolve for a signed-out visitor. Signed-in users reach the
          same screens from Settings.
          The titles feed NavigationContainer's documentTitle formatter, so
          each page gets a real browser-tab name instead of the route name. */}
      <Stack.Screen name="SharedGuideView" component={SharedGuideViewScreen} />
      <Stack.Screen name="Install" component={InstallScreen} />
      <Stack.Screen name="About" component={AboutScreen} options={{ title: 'About Us' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy Policy' }} />
      <Stack.Screen name="Terms" component={TermsScreen} options={{ title: 'Terms of Service' }} />
      <Stack.Screen name="Refund" component={RefundScreen} options={{ title: 'Refund Policy' }} />
    </Stack.Navigator>
  );
}
