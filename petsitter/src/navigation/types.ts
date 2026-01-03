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
// Main Tab Navigator (Bottom Tabs)
// ============================================
export type MainTabParamList = {
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
  SharedGuideView: { code: string };
  PDFPreview: { guideId: string };

  // AI Features
  AICheatSheet: { guideId: string };

  // Settings
  Settings: undefined;
  Profile: undefined;
  Memorial: undefined;

  // Onboarding
  Onboarding: undefined;
};

// Screen Props Types
export type HomeScreenProps = NativeStackScreenProps<MainTabParamList, 'Home'>;

export type PetListScreenProps = NativeStackScreenProps<MainTabParamList, 'Pets'>;
export type PetDetailScreenProps = NativeStackScreenProps<MainTabParamList, 'PetDetail'>;
export type PetFormScreenProps = NativeStackScreenProps<MainTabParamList, 'PetForm'>;

export type GuideListScreenProps = NativeStackScreenProps<MainTabParamList, 'Guides'>;
export type GuideDetailScreenProps = NativeStackScreenProps<MainTabParamList, 'GuideDetail'>;
export type GuideFormScreenProps = NativeStackScreenProps<MainTabParamList, 'GuideForm'>;

export type EmergencyContactsScreenProps = NativeStackScreenProps<MainTabParamList, 'EmergencyContacts'>;
export type HomeInfoScreenProps = NativeStackScreenProps<MainTabParamList, 'HomeInfo'>;
export type TravelItineraryScreenProps = NativeStackScreenProps<MainTabParamList, 'TravelItinerary'>;
export type DailyRoutineScreenProps = NativeStackScreenProps<MainTabParamList, 'DailyRoutine'>;
export type HomeCareScreenProps = NativeStackScreenProps<MainTabParamList, 'HomeCare'>;

export type ShareGuideScreenProps = NativeStackScreenProps<MainTabParamList, 'ShareGuide'>;
export type SharedGuideViewScreenProps = NativeStackScreenProps<MainTabParamList, 'SharedGuideView'>;
export type PDFPreviewScreenProps = NativeStackScreenProps<MainTabParamList, 'PDFPreview'>;

export type AICheatSheetScreenProps = NativeStackScreenProps<MainTabParamList, 'AICheatSheet'>;

export type SettingsScreenProps = NativeStackScreenProps<MainTabParamList, 'Settings'>;
export type ProfileScreenProps = NativeStackScreenProps<MainTabParamList, 'Profile'>;
export type MemorialScreenProps = NativeStackScreenProps<MainTabParamList, 'Memorial'>;

export type OnboardingScreenProps = NativeStackScreenProps<MainTabParamList, 'Onboarding'>;

// ============================================
// Root Stack
// ============================================
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
