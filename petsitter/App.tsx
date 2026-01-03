import './src/global.css';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, DataProvider } from './src/contexts';
import { RootNavigator } from './src/navigation';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <DataProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </DataProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
