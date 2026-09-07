import './src/global.css';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, DataProvider } from './src/contexts';
import { RootNavigator } from './src/navigation';
import { ModalHost } from './src/components/AppModal';

const linking = {
  // Native deep links (pawstructions://) + web origin (https://your-domain)
  prefixes: [
    'pawstructions://',
    ...(typeof window !== 'undefined' && window.location?.origin ? [window.location.origin] : []),
  ],
  config: {
    screens: {
      /**
       * The authed stack, named route by route.
       *
       * WHY THIS LIST EXISTS. Without it React Navigation still WRITES these
       * URLs — its fallback serialises route name to path and params to query
       * string — but it cannot READ them back: getStateFromPath returns
       * undefined for any path it has no config for. That asymmetry is
       * invisible until you reload.
       *
       * React Navigation keeps an in-memory record of the history entries it
       * created itself, and uses that record on popstate rather than parsing
       * the URL. A reload throws that record away. So the entries BEHIND the
       * reloaded page are now entries it has no record of, and going back to
       * one falls through to getStateFromPath, which answered undefined, which
       * became resetRoot(undefined) and threw "Cannot read properties of
       * undefined (reading 'routes')" inside useLinking. The address bar moved
       * and the screen did not: the departed screen stayed in front, fully
       * interactive, while the URL claimed you were somewhere else. Tab from
       * there and every stop belonged to a screen that was supposed to be gone.
       *
       * That is why "browser back works fine" and "browser back is broken" were
       * both true depending on whether anyone had pressed reload first.
       *
       * Each entry is just the route's own name, which reproduces EXACTLY the
       * paths the fallback was already generating — /Main/PetDetail?petId=...
       * and so on. Verified path-by-path before and after, because
       * create-checkout-session sends live customers back to
       * /Main/UnlockCrown?checkout=success and that URL had to keep resolving
       * to the same screen with the same param.
       *
       * This does NOT replace RootNavigator's RESTORABLE_MAIN_ROUTES. That
       * handles a different moment — the FIRST paint after a hard load, when
       * the authed stack does not exist yet because the Supabase session is
       * still being restored. This handles every navigation after it.
       */
      /**
       * The signed-out stack, for the same reason Main is listed below: React
       * Navigation was already WRITING these paths through its fallback but
       * could not read them back, so /Auth/SignUp resolved to nothing and
       * bounced the visitor to the landing page.
       *
       * That became load-bearing when the landing page gained a "Sign Up as a
       * Sitter" button, which produces /Auth/SignUp?role=sitter. Without this,
       * reloading mid-signup — or sharing that link with a sitter, which is
       * exactly what it is for — lost both the screen and the preselected role.
       */
      Auth: {
        path: 'Auth',
        screens: {
          Landing: 'Landing',
          Login: 'Login',
          SignUp: 'SignUp',
          ForgotPassword: 'ForgotPassword',
        },
      },
      Main: {
        path: 'Main',
        screens: {
          Home: 'Home',
          Pets: 'Pets',
          PetDetail: 'PetDetail',
          PetForm: 'PetForm',
          Guides: 'Guides',
          GuideDetail: 'GuideDetail',
          GuideForm: 'GuideForm',
          DailyRoutine: 'DailyRoutine',
          HomeCare: 'HomeCare',
          ShareGuide: 'ShareGuide',
          PDFPreview: 'PDFPreview',
          AICheatSheet: 'AICheatSheet',
          SampleCheatSheet: 'SampleCheatSheet',
          CheatSheets: 'CheatSheets',
          Sitters: 'Sitters',
          UnlockCrown: 'UnlockCrown',
          SitterHome: 'SitterHome',
          SitterToday: 'SitterToday',
          SitterHousehold: 'SitterHousehold',
          SitterPlans: 'SitterPlans',
          Settings: 'Settings',
          Memorial: 'Memorial',
          Household: 'Household',
          Onboarding: 'Onboarding',
          TripWizard: 'TripWizard',
        },
      },
      // Public share route — works whether the viewer is signed in or not
      SharedGuideView: 'share/:code',
      // PWA install instructions — public, reachable signed in or out
      Install: 'install',
      // Trust pages — public and directly addressable. Stripe will not
      // activate a live account without reaching a service description,
      // terms, privacy policy and refund policy, and their reviewer has no
      // login, so these must resolve for a signed-out visitor by URL alone.
      About: 'about',
      FAQ: 'faq',
      Privacy: 'privacy',
      Terms: 'terms',
      Refund: 'refunds',
    },
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <DataProvider>
          <NavigationContainer
            linking={linking}
            documentTitle={{
              // Without a formatter, web tab titles fall back to route names
              // (or "undefined" before the first route resolves).
              formatter: (options) =>
                options?.title ? `${options.title} — Pawstructions` : 'Pawstructions',
            }}
          >
            <RootNavigator />
          </NavigationContainer>
        </DataProvider>
      </AuthProvider>
      <ModalHost />
    </SafeAreaProvider>
  );
}
