import { Alert, Platform } from 'react-native';
import { pushDialogRequest } from '../components/AppModal';

/**
 * Imperative dialog API backed by the branded ModalHost (see
 * src/components/AppModal.tsx), used identically on web and native.
 *
 * FALLBACK: if ModalHost is not mounted yet (very early startup), degrade to
 * the legacy behavior — window.alert/window.confirm on web, Alert.alert on
 * native — so dialogs are never silently lost.
 */

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

/** Show a branded alert dialog with a single OK button. */
export function showAlert(title: string, message?: string): Promise<void> {
  return new Promise((resolve) => {
    const accepted = pushDialogRequest({
      kind: 'alert',
      title,
      message,
      resolve: () => resolve(),
    });
    if (accepted) {
      return;
    }
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      window.alert(message ? `${title}\n\n${message}` : title);
      resolve();
    } else {
      Alert.alert(title, message, [{ text: 'OK', onPress: () => resolve() }], {
        cancelable: true,
        onDismiss: () => resolve(),
      });
    }
  });
}

/**
 * Show a branded confirm dialog. Resolves true when confirmed, false when
 * cancelled or dismissed (backdrop tap, hardware back, Escape).
 */
export function showConfirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const accepted = pushDialogRequest({
      kind: 'confirm',
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel,
      cancelLabel: opts.cancelLabel,
      destructive: opts.destructive,
      resolve,
    });
    if (accepted) {
      return;
    }
    if (Platform.OS === 'web') {
      resolve(
        // eslint-disable-next-line no-alert
        window.confirm(
          opts.message ? `${opts.title}\n\n${opts.message}` : opts.title
        )
      );
    } else {
      Alert.alert(
        opts.title,
        opts.message,
        [
          {
            text: opts.cancelLabel ?? 'Cancel',
            style: 'cancel',
            onPress: () => resolve(false),
          },
          {
            text: opts.confirmLabel ?? 'Confirm',
            style: opts.destructive ? 'destructive' : 'default',
            onPress: () => resolve(true),
          },
        ],
        { cancelable: true, onDismiss: () => resolve(false) }
      );
    }
  });
}
