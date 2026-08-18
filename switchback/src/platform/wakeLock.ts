/**
 * Keep the screen awake during a round.
 *
 * Nobody touches the phone for sixty seconds while it sits on a forehead, so
 * without this the display sleeps mid-round on default settings. Native builds
 * would swap in expo-keep-awake behind the same two calls.
 */

import { Platform } from 'react-native';

export interface WakeLock {
  acquire(): Promise<void>;
  release(): Promise<void>;
}

const noop: WakeLock = { async acquire() {}, async release() {} };

function createWebWakeLock(): WakeLock {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return noop;

  let sentinel: WakeLockSentinel | null = null;

  return {
    async acquire() {
      try {
        sentinel = await navigator.wakeLock.request('screen');
      } catch {
        // Denied, or the tab lost visibility between call and grant. The round
        // plays fine without it; there is nothing useful to tell the player.
        sentinel = null;
      }
    },
    async release() {
      try {
        await sentinel?.release();
      } catch {
        // Already released by the browser on tab hide.
      }
      sentinel = null;
    },
  };
}

export const wakeLock: WakeLock =
  Platform.OS === 'web' ? createWebWakeLock() : noop;
