import { Alert, Platform } from 'react-native';

/**
 * Cross-platform alert. On web, RN's Alert module is a no-op, so fall back to
 * window.alert (which ignores the title). On native, use Alert.alert normally.
 */
export function showAlert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    window.alert(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}
