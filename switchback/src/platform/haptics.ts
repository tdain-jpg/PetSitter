/**
 * A short buzz on a verdict. The phone is on a forehead, so the buzz is the
 * only confirmation the player actually gets.
 *
 * Web vibration is Android-only; iOS Safari ignores it. That's fine — the
 * colour flash is the primary feedback and this is a bonus where it exists.
 */

import { Platform } from 'react-native';

export interface Haptics {
  tap(): void;
  thud(): void;
}

const noop: Haptics = { tap() {}, thud() {} };

function createWebHaptics(): Haptics {
  const canVibrate =
    typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  if (!canVibrate) return noop;
  return {
    tap: () => navigator.vibrate(30),
    thud: () => navigator.vibrate([0, 40, 60, 40]),
  };
}

export const haptics: Haptics =
  Platform.OS === 'web' ? createWebHaptics() : noop;
