import { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { Button } from './Button';

/**
 * A single dialog request driven imperatively from src/lib/dialogs.ts.
 * `resolve` is called exactly once when the dialog is settled:
 *  - alert: resolve(true) on OK (or dismiss)
 *  - confirm: resolve(true) on confirm, resolve(false) on cancel/dismiss
 */
export interface DialogRequest {
  kind: 'alert' | 'confirm';
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  resolve: (result: boolean) => void;
}

type DialogHandler = (request: DialogRequest) => void;

// Module-level ref so lib/dialogs.ts can drive the host without context/providers.
let dialogHandler: DialogHandler | null = null;

/**
 * Enqueue a dialog on the mounted ModalHost. Returns false when no host is
 * mounted (e.g. very early startup) so the caller can fall back to legacy
 * alert behavior instead of silently dropping the dialog.
 */
export function pushDialogRequest(request: DialogRequest): boolean {
  if (!dialogHandler) {
    return false;
  }
  dialogHandler(request);
  return true;
}

/**
 * Branded in-app replacement for window.alert / window.confirm / Alert.alert,
 * used on BOTH platforms. Mount exactly once at the app root; call sites go
 * through showAlert/showConfirm in src/lib/dialogs.ts.
 */
export function ModalHost() {
  // FIFO queue: requests arriving while a dialog is open wait their turn.
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const current = queue.length > 0 ? queue[0] : null;

  useEffect(() => {
    const handler: DialogHandler = (request) => {
      setQueue((prev) => [...prev, request]);
    };
    dialogHandler = handler;
    return () => {
      if (dialogHandler === handler) {
        dialogHandler = null;
      }
    };
  }, []);

  // Settle a specific request so a rapid double-press can't also pop the next
  // queued dialog. Promise resolve is idempotent, so a second call is a no-op.
  const settle = useCallback((request: DialogRequest, result: boolean) => {
    setQueue((prev) => (prev[0] === request ? prev.slice(1) : prev));
    request.resolve(result);
  }, []);

  const confirm = useCallback(() => {
    if (current) {
      settle(current, true);
    }
  }, [current, settle]);

  // Backdrop tap / hardware back / Escape. Alerts just dismiss (result unused);
  // confirms resolve false.
  const dismiss = useCallback(() => {
    if (current) {
      settle(current, current.kind !== 'confirm');
    }
  }, [current, settle]);

  // Web-only keyboard shortcuts: Enter confirms, Escape cancels. The dialog
  // contains no text inputs, so a document-level listener is safe.
  useEffect(() => {
    if (Platform.OS !== 'web' || !current) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        confirm();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        dismiss();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [current, confirm, dismiss]);

  if (!current) {
    return null;
  }

  const isConfirm = current.kind === 'confirm';

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={dismiss}
    >
      <Pressable
        className="flex-1 bg-black/50 justify-center items-center p-6"
        onPress={dismiss}
        accessibilityLabel="Dismiss dialog"
      >
        {/* Inner Pressable claims the touch so tapping the card doesn't dismiss. */}
        <Pressable
          onPress={() => {}}
          accessibilityViewIsModal
          accessibilityRole="alert"
          className="bg-cream-50 rounded-xl p-6 w-full shadow-lg"
          style={{ maxWidth: 400 }}
        >
          <Text className="text-brown-800 text-lg font-semibold">
            {current.title}
          </Text>
          {current.message ? (
            <Text className="text-tan-600 text-base mt-2">
              {current.message}
            </Text>
          ) : null}
          <View className="flex-row justify-end mt-6">
            {isConfirm ? (
              <>
                <Button
                  title={current.cancelLabel ?? 'Cancel'}
                  variant="outline"
                  onPress={() => settle(current, false)}
                />
                <View className="w-3" />
                <Button
                  title={current.confirmLabel ?? 'Confirm'}
                  variant={current.destructive ? 'danger' : 'primary'}
                  onPress={confirm}
                />
              </>
            ) : (
              <Button title="OK" variant="primary" onPress={confirm} />
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
