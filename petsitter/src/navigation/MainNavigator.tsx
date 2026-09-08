import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '../screens/HomeScreen';
import { PetListScreen } from '../screens/PetListScreen';
import { PetDetailScreen } from '../screens/PetDetailScreen';
import { PetFormScreen } from '../screens/PetFormScreen';
import { GuideListScreen } from '../screens/GuideListScreen';
import { GuideDetailScreen } from '../screens/GuideDetailScreen';
import { GuideFormScreen } from '../screens/GuideFormScreen';
import { DailyRoutineScreen } from '../screens/DailyRoutineScreen';
import { HomeCareScreen } from '../screens/HomeCareScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { MemorialScreen } from '../screens/MemorialScreen';
import { HouseholdScreen } from '../screens/HouseholdScreen';
import { ShareGuideScreen } from '../screens/ShareGuideScreen';
import { PDFPreviewScreen } from '../screens/PDFPreviewScreen';
import { AICheatSheetScreen } from '../screens/AICheatSheetScreen';
import { SampleCheatSheetScreen } from '../screens/SampleCheatSheetScreen';
import { CheatSheetsScreen } from '../screens/CheatSheetsScreen';
import { SittersScreen } from '../screens/SittersScreen';
import { SitterTodayScreen } from '../screens/SitterTodayScreen';
import { InviteClientScreen } from '../screens/InviteClientScreen';
import { VisitHistoryScreen } from '../screens/VisitHistoryScreen';
import { SitterHomeScreen } from '../screens/SitterHomeScreen';
import { SitterHouseholdScreen } from '../screens/SitterHouseholdScreen';
import { SitterPlansScreen } from '../screens/SitterPlansScreen';
import { UnlockCrownScreen } from '../screens/UnlockCrownScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { TripWizardScreen } from '../screens/TripWizardScreen';
import type { MainStackParamList } from './types';
import { hosted } from './ScreenHost';


/**
 * Wrapped ONCE, at module scope.
 *
 * hosted() must not be called inside the JSX below: that produces a new
 * component identity on every render of this navigator, and React would
 * unmount and remount the screen each time — throwing away its scroll
 * position, its form state and any in-flight request. Built up here, each
 * wrapper is stable for the life of the module.
 */
const HomeH = hosted(HomeScreen);
const PetListH = hosted(PetListScreen);
const PetDetailH = hosted(PetDetailScreen);
const PetFormH = hosted(PetFormScreen);
const GuideListH = hosted(GuideListScreen);
const GuideDetailH = hosted(GuideDetailScreen);
const GuideFormH = hosted(GuideFormScreen);
const DailyRoutineH = hosted(DailyRoutineScreen);
const HomeCareH = hosted(HomeCareScreen);
const SettingsH = hosted(SettingsScreen);
const MemorialH = hosted(MemorialScreen);
const HouseholdH = hosted(HouseholdScreen);
const ShareGuideH = hosted(ShareGuideScreen);
const PDFPreviewH = hosted(PDFPreviewScreen);
const AICheatSheetH = hosted(AICheatSheetScreen);
const SampleCheatSheetH = hosted(SampleCheatSheetScreen);
const CheatSheetsH = hosted(CheatSheetsScreen);
const SittersH = hosted(SittersScreen);
const SitterHomeH = hosted(SitterHomeScreen);
const SitterTodayH = hosted(SitterTodayScreen);
const InviteClientH = hosted(InviteClientScreen);
const VisitHistoryH = hosted(VisitHistoryScreen);
const SitterHouseholdH = hosted(SitterHouseholdScreen);
const SitterPlansH = hosted(SitterPlansScreen);
const UnlockCrownH = hosted(UnlockCrownScreen);
const OnboardingH = hosted(OnboardingScreen);
const TripWizardH = hosted(TripWizardScreen);

const Stack = createNativeStackNavigator<MainStackParamList>();

export function MainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#FAF6EA' },
      }}
    >
      <Stack.Screen name="Home" component={HomeH} />
      <Stack.Screen name="Pets" component={PetListH} />
      <Stack.Screen name="PetDetail" component={PetDetailH} />
      <Stack.Screen name="PetForm" component={PetFormH} />
      <Stack.Screen name="Guides" component={GuideListH} />
      <Stack.Screen name="GuideDetail" component={GuideDetailH} />
      <Stack.Screen name="GuideForm" component={GuideFormH} />
      <Stack.Screen name="DailyRoutine" component={DailyRoutineH} />
      <Stack.Screen name="HomeCare" component={HomeCareH} />
      <Stack.Screen name="Settings" component={SettingsH} />
      <Stack.Screen name="Memorial" component={MemorialH} />
      <Stack.Screen name="Household" component={HouseholdH} />
      <Stack.Screen name="ShareGuide" component={ShareGuideH} />
      <Stack.Screen name="PDFPreview" component={PDFPreviewH} />
      <Stack.Screen name="AICheatSheet" component={AICheatSheetH} />
      <Stack.Screen name="SampleCheatSheet" component={SampleCheatSheetH} />
      <Stack.Screen name="CheatSheets" component={CheatSheetsH} />
      <Stack.Screen name="Sitters" component={SittersH} />
      <Stack.Screen name="SitterHome" component={SitterHomeH} />
      <Stack.Screen name="SitterToday" component={SitterTodayH} />
      <Stack.Screen name="InviteClient" component={InviteClientH} />
      <Stack.Screen name="VisitHistory" component={VisitHistoryH} />
      <Stack.Screen name="SitterHousehold" component={SitterHouseholdH} />
      <Stack.Screen name="SitterPlans" component={SitterPlansH} />
      <Stack.Screen name="UnlockCrown" component={UnlockCrownH} />
      <Stack.Screen name="Onboarding" component={OnboardingH} />
      <Stack.Screen name="TripWizard" component={TripWizardH} />
    </Stack.Navigator>
  );
}
