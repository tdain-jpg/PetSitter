import { useEffect, useRef } from 'react';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthNavigator } from './AuthNavigator';
import { MainNavigator } from './MainNavigator';
import { SharedGuideViewScreen } from '../screens/SharedGuideViewScreen';
import { InstallScreen } from '../screens/InstallScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';
import { AboutScreen } from '../screens/AboutScreen';
import { FAQScreen } from '../screens/FAQScreen';
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

/**
 * Where to send the user back to after an identity provider round trip.
 *
 * signInWithOAuth sends Google a redirectTo of window.location.origin — the
 * BARE origin — so Google returns the browser to https://pawstructions.com/
 * and the URL the user actually asked for is gone before the app reloads.
 * Ask for /Main/Guides while signed out, sign in with Google, and you land on
 * Home having been silently ignored. sessionStorage is the only thing that
 * survives that round trip, and it is per-tab, so a second tab cannot steal it.
 */
const OAUTH_RETURN_KEY = 'pawstructions.postAuthPath';

/** True only on the way back from Supabase's OAuth/magic-link callback. */
function isAuthCallbackUrl(): boolean {
  const blob = `${window.location.hash}${window.location.search}`;
  return /[#&?](access_token|refresh_token|code|error_description)=/.test(blob);
}

function capturePendingWebPath(): string | null {
  if (typeof window === 'undefined' || !window.location) return null;

  const here = `${window.location.pathname}${window.location.search}`;

  if (here.startsWith('/Main/')) {
    // Remember it in case this visit is about to bounce through Google. Doing
    // it here rather than in the sign-in handler is deliberate: by the time the
    // user reaches a sign-in button they are on /Auth/Landing and the URL they
    // originally wanted is already gone.
    try {
      window.sessionStorage.setItem(OAUTH_RETURN_KEY, here);
    } catch {
      // Private mode or storage disabled. The deep link simply won't survive
      // an OAuth hop, which is exactly the behaviour before this existed.
    }
  }

  // Only a real callback may consume the stored path. Without that guard the
  // value outlives its purpose: open the bare origin in the same tab an hour
  // later and you would be flung to a page you asked for once, long ago.
  if (isAuthCallbackUrl()) {
    try {
      const saved = window.sessionStorage.getItem(OAUTH_RETURN_KEY);
      window.sessionStorage.removeItem(OAUTH_RETURN_KEY);
      if (saved) return saved;
    } catch {
      // Fall through to the URL we actually have.
    }
  }

  return here;
}

let pendingWebPath: string | null = capturePendingWebPath();

type RestoredParams = { params: object | undefined };
type ParamParser = (query: URLSearchParams) => RestoredParams | null;

const noParams: ParamParser = () => ({ params: undefined });

// Restoring a route from a URL means the params come from whatever the address
// bar happens to hold. For ids that is fine once they are shape-checked — a
// bad uuid resolves to nothing and the screen says so — but free text is not,
// which is why nothing below ever restores a name or a label.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  VisitHistory: guideParams,
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
  // The sitter side. Left out of this list until now, which meant a sitter who
  // reloaded the page — or opened their client's household in a new tab — was
  // silently dropped on the owner dashboard, a screen with none of their
  // clients on it and no obvious way back.
  SitterHome: noParams,
  SitterToday: noParams,
  // Matched against the three values sitter-billing can send rather than
  // forwarded verbatim, so arbitrary query text never reaches route.params.
  SitterPlans: (query) => {
    const checkout = query.get('checkout');
    return {
      params:
        checkout === 'success' || checkout === 'cancelled' || checkout === 'done'
          ? { checkout }
          : undefined,
    };
  },
  // Param-free destinations that were simply never listed. Each is a screen a
  // user can reach, bookmark and reload, and each silently answered that
  // reload with Home — the same class of bug as the sitter routes above, found
  // by diffing MainStackParamList against this list rather than by guessing.
  // Onboarding and TripWizard are absent from this list on purpose, but that
  // no longer decides the question: App.tsx's linking config now names every
  // Main route, and it resolves a hard-loaded URL before this ever runs. Both
  // therefore open at step one on a direct hit, which is what clicking into
  // them does anyway. This list's remaining job is the narrow window where the
  // authed stack has not mounted yet.
  CheatSheets: noParams,
  Sitters: noParams,
  Memorial: noParams,
  SampleCheatSheet: noParams,
  SitterHousehold: (query) => {
    const householdId = query.get('householdId');
    // householdName is deliberately NOT restored: the screen looks it up from
    // the sitter's connection list, which is the only trustworthy source.
    return householdId && UUID_RE.test(householdId) ? { params: { householdId } } : null;
  },
  GuideForm: (query) => {
    const mode = query.get('mode');
    if (mode === 'create') return { params: { mode } };
    const guideId = query.get('guideId');
    if (mode === 'edit' && guideId) return { params: { mode, guideId } };
    return null;
  },
};

/**
 * Name of the route actually in front, walking down through nested navigators.
 */
function focusedRouteName(state: any): string | undefined {
  let node = state;
  while (node && Array.isArray(node.routes)) {
    const route = node.routes[node.index ?? 0];
    if (!route) return undefined;
    if (route.state) {
      node = route.state;
      continue;
    }
    return route.name;
  }
  return undefined;
}

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

    /**
     * If the linking config already put us on this screen, STOP.
     *
     * Dispatching again looks harmless — same screen, same params — but it
     * grows the stack by one, and React Navigation turns any positive history
     * delta into history.push, whose own source notes that "path might not
     * actually change here". The result was two consecutive history entries
     * with the identical URL. Pressing Back moved between them and nothing
     * happened: same address, same screen, a dead button. It only showed up
     * after a reload, because only then does this restore run on a screen the
     * linking config has just restored by itself.
     *
     * The dispatch is NOT removed, only skipped when redundant. It is still the
     * safety net for the case where the URL survived but the linking config did
     * not place us — most importantly the Stripe return to
     * /Main/UnlockCrown?checkout=success, which is real money coming back and
     * must not depend on a single mechanism.
     */
    if (focusedRouteName(navigation.getState?.()) === route.name) return;

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
      <Stack.Screen name="FAQ" component={FAQScreen} options={{ title: 'Questions & Answers' }} />
      <Stack.Screen name="Privacy" component={PrivacyScreen} options={{ title: 'Privacy Policy' }} />
      <Stack.Screen name="Terms" component={TermsScreen} options={{ title: 'Terms of Service' }} />
      <Stack.Screen name="Refund" component={RefundScreen} options={{ title: 'Refund Policy' }} />
    </Stack.Navigator>
  );
}
