import { showAlert as showAlertDialog } from './dialogs';

/**
 * Compatibility shim: delegates to the branded dialog API in ./dialogs
 * (fire-and-forget). Kept at this import path with a void return type so
 * existing call sites keep compiling unchanged. New code that needs to await
 * the dialog should import from './dialogs' directly.
 */
export function showAlert(title: string, message?: string): void {
  void showAlertDialog(title, message);
}
