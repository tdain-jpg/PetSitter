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
import { ShareGuideScreen } from '../screens/ShareGuideScreen';
import { PDFPreviewScreen } from '../screens/PDFPreviewScreen';
import { AICheatSheetScreen } from '../screens/AICheatSheetScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import type { MainTabParamList } from './types';

const Stack = createNativeStackNavigator<MainTabParamList>();

export function MainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#f9fafb' },
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Pets" component={PetListScreen} />
      <Stack.Screen name="PetDetail" component={PetDetailScreen} />
      <Stack.Screen name="PetForm" component={PetFormScreen} />
      <Stack.Screen name="Guides" component={GuideListScreen} />
      <Stack.Screen name="GuideDetail" component={GuideDetailScreen} />
      <Stack.Screen name="GuideForm" component={GuideFormScreen} />
      <Stack.Screen name="DailyRoutine" component={DailyRoutineScreen} />
      <Stack.Screen name="HomeCare" component={HomeCareScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="Memorial" component={MemorialScreen} />
      <Stack.Screen name="ShareGuide" component={ShareGuideScreen} />
      <Stack.Screen name="PDFPreview" component={PDFPreviewScreen} />
      <Stack.Screen name="AICheatSheet" component={AICheatSheetScreen} />
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
    </Stack.Navigator>
  );
}
