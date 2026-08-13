import './src/global.css';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, DataProvider } from './src/contexts';
import { RootNavigator } from './src/navigation';

const linking = {
  // Native deep links (pawstructions://) + web origin (https://your-domain)
  prefixes: [
    'pawstructions://',
    ...(typeof window !== 'undefined' && window.location?.origin ? [window.location.origin] : []),
  ],
  config: {
    screens: {
      // Public share route — works whether the viewer is signed in or not
      SharedGuideView: 'share/:code',
    },
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <DataProvider>
          <NavigationContainer linking={linking}>
            <RootNavigator />
          </NavigationContainer>
        </DataProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
