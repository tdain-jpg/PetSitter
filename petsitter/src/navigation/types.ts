import type { NativeStackScreenProps } from '@react-navigation/native-stack';

// ============================================
// Auth Stack
// ============================================
export type AuthStackParamList = {
  Landing: undefined;
  Login: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
};

export type LandingScreenProps = NativeStackScreenProps<AuthStackParamList, 'Landing'>;
export type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;
export type SignUpScreenProps = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;
export type ForgotPasswordScreenProps = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

// ============================================
// Main Stack Navigator
// ============================================
export type MainStackParamList = {
  // Home/Dashboard
  Home: undefined;

  // Pets
  Pets: undefined;
  PetDetail: { petId: string };
  PetForm: { mode: 'create' } | { mode: 'edit'; petId: string };

  // Guides
  Guides: undefined;
  GuideDetail: { guideId: string };
  GuideForm: { mode: 'create' } | { mode: 'edit'; guideId: string };

  // Guide Sub-screens
  DailyRoutine: { guideId: string };
  HomeCare: { guideId: string };

  // Share & Export
  ShareGuide: { guideId: string };
  PDFPreview: { guideId: string };

  // AI Features
  AICheatSheet: { guideId: string };
  SampleCheatSheet: undefined;

  // Crown purchase. guideId is optional so the screen can send the user back
  // to the sheet they were trying to unlock; entering from Settings has none.
  UnlockCrown: { guideId?: string } | undefined;

  // Settings
  Settings: undefined;
  Memorial: undefined;
  Household: undefined;

  // Onboarding
  Onboarding: undefined;

  // Trip Planning
  TripWizard: undefined;
};

// Screen Props Types
export type HomeScreenProps = NativeStackScreenProps<MainStackParamList, 'Home'>;

export type PetListScreenProps = NativeStackScreenProps<MainStackParamList, 'Pets'>;
export type PetDetailScreenProps = NativeStackScreenProps<MainStackParamList, 'PetDetail'>;
export type PetFormScreenProps = NativeStackScreenProps<MainStackParamList, 'PetForm'>;

export type GuideListScreenProps = NativeStackScreenProps<MainStackParamList, 'Guides'>;
export type GuideDetailScreenProps = NativeStackScreenProps<MainStackParamList, 'GuideDetail'>;
export type GuideFormScreenProps = NativeStackScreenProps<MainStackParamList, 'GuideForm'>;

export type DailyRoutineScreenProps = NativeStackScreenProps<MainStackParamList, 'DailyRoutine'>;
export type HomeCareScreenProps = NativeStackScreenProps<MainStackParamList, 'HomeCare'>;

export type ShareGuideScreenProps = NativeStackScreenProps<MainStackParamList, 'ShareGuide'>;
export type SharedGuideViewScreenProps = NativeStackScreenProps<RootStackParamList, 'SharedGuideView'>;
export type PDFPreviewScreenProps = NativeStackScreenProps<MainStackParamList, 'PDFPreview'>;

export type AICheatSheetScreenProps = NativeStackScreenProps<MainStackParamList, 'AICheatSheet'>;
export type SampleCheatSheetScreenProps = NativeStackScreenProps<MainStackParamList, 'SampleCheatSheet'>;

export type SettingsScreenProps = NativeStackScreenProps<MainStackParamList, 'Settings'>;
export type MemorialScreenProps = NativeStackScreenProps<MainStackParamList, 'Memorial'>;
export type HouseholdScreenProps = NativeStackScreenProps<MainStackParamList, 'Household'>;

export type OnboardingScreenProps = NativeStackScreenProps<MainStackParamList, 'Onboarding'>;

// ============================================
// Root Stack
// ============================================
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  SharedGuideView: { code: string };
  Install: undefined;

  // Public trust pages. On the ROOT stack, not Main, because they must render
  // for a signed-OUT visitor: Stripe will not activate a live account without
  // reaching a service description, terms, privacy and refund policy, and
  // their reviewer has no login. Signed-in users reach them from Settings.
  About: undefined;
  Privacy: undefined;
  Terms: undefined;
  Refund: undefined;
};

export type InstallScreenProps = NativeStackScreenProps<RootStackParamList, 'Install'>;

export type UnlockCrownScreenProps = NativeStackScreenProps<MainStackParamList, 'UnlockCrown'>;
export type AboutScreenProps = NativeStackScreenProps<RootStackParamList, 'About'>;
export type PrivacyScreenProps = NativeStackScreenProps<RootStackParamList, 'Privacy'>;
export type TermsScreenProps = NativeStackScreenProps<RootStackParamList, 'Terms'>;
export type RefundScreenProps = NativeStackScreenProps<RootStackParamList, 'Refund'>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
