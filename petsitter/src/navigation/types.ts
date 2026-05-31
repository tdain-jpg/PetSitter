import type { NativeStackScreenProps } from '@react-navigation/native-stack';

// ============================================
// Auth Stack
// ============================================
export type AuthStackParamList = {
  Landing: undefined;
  Login: undefined;
  SignUp: undefined;
};

export type LandingScreenProps = NativeStackScreenProps<AuthStackParamList, 'Landing'>;
export type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;
export type SignUpScreenProps = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

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
  EmergencyContacts: { guideId: string };
  HomeInfo: { guideId: string };
  TravelItinerary: { guideId: string };
  DailyRoutine: { guideId: string };
  HomeCare: { guideId: string };

  // Share & Export
  ShareGuide: { guideId: string };
  PDFPreview: { guideId: string };

  // AI Features
  AICheatSheet: { guideId: string };

  // Settings
  Settings: undefined;
  Profile: undefined;
  Memorial: undefined;

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

export type EmergencyContactsScreenProps = NativeStackScreenProps<MainStackParamList, 'EmergencyContacts'>;
export type HomeInfoScreenProps = NativeStackScreenProps<MainStackParamList, 'HomeInfo'>;
export type TravelItineraryScreenProps = NativeStackScreenProps<MainStackParamList, 'TravelItinerary'>;
export type DailyRoutineScreenProps = NativeStackScreenProps<MainStackParamList, 'DailyRoutine'>;
export type HomeCareScreenProps = NativeStackScreenProps<MainStackParamList, 'HomeCare'>;

export type ShareGuideScreenProps = NativeStackScreenProps<MainStackParamList, 'ShareGuide'>;
export type SharedGuideViewScreenProps = NativeStackScreenProps<RootStackParamList, 'SharedGuideView'>;
export type PDFPreviewScreenProps = NativeStackScreenProps<MainStackParamList, 'PDFPreview'>;

export type AICheatSheetScreenProps = NativeStackScreenProps<MainStackParamList, 'AICheatSheet'>;

export type SettingsScreenProps = NativeStackScreenProps<MainStackParamList, 'Settings'>;
export type ProfileScreenProps = NativeStackScreenProps<MainStackParamList, 'Profile'>;
export type MemorialScreenProps = NativeStackScreenProps<MainStackParamList, 'Memorial'>;

export type OnboardingScreenProps = NativeStackScreenProps<MainStackParamList, 'Onboarding'>;

// ============================================
// Root Stack
// ============================================
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
  SharedGuideView: { code: string };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
