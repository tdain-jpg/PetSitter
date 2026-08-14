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
      // Public share route — works whether the viewer is signed in or not
      SharedGuideView: 'share/:code',
      // PWA install instructions — public, reachable signed in or out
      Install: 'install',
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
