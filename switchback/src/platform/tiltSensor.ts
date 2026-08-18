/**
 * Device-orientation input.
 *
 * Web uses DeviceOrientationEvent. iOS 13+ gates that behind a permission call
 * that must happen inside a user gesture, which is why `request()` is separate
 * from `subscribe()` and why the UI asks on a button press.
 *
 * Native builds would implement this same interface with expo-sensors
 * DeviceMotion; nothing above this file changes.
 */

import { Platform } from 'react-native';
import type { TiltReading } from '../core/tilt';

export type TiltPermission = 'granted' | 'denied' | 'unsupported';

export interface TiltSensor {
  /** True if this build can offer tilt at all. */
  available: boolean;
  request(): Promise<TiltPermission>;
  /** Returns an unsubscribe function. */
  subscribe(onReading: (reading: TiltReading) => void): () => void;
}

const unsupportedSensor: TiltSensor = {
  available: false,
  async request() {
    return 'unsupported';
  },
  subscribe() {
    return () => {};
  },
};

function screenAngle(): number {
  if (typeof window === 'undefined') return 0;
  const fromApi = window.screen?.orientation?.angle;
  if (typeof fromApi === 'number') return fromApi;
  // Safari on older iOS only exposes the deprecated window.orientation.
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
}

function createWebSensor(): TiltSensor {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
    return unsupportedSensor;
  }

  const ctor = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  };

  return {
    available: true,
    async request() {
      if (typeof ctor.requestPermission !== 'function') {
        // Android and desktop Chrome deliver events without asking.
        return 'granted';
      }
      try {
        return await ctor.requestPermission();
      } catch {
        // Thrown when called outside a user gesture, or on an insecure origin.
        return 'denied';
      }
    },
    subscribe(onReading) {
      const handler = (event: DeviceOrientationEvent) => {
        if (event.beta === null || event.gamma === null) return;
        onReading({
          beta: event.beta,
          gamma: event.gamma,
          screenAngle: screenAngle(),
        });
      };
      window.addEventListener('deviceorientation', handler);
      return () => window.removeEventListener('deviceorientation', handler);
    },
  };
}

export const tiltSensor: TiltSensor =
  Platform.OS === 'web' ? createWebSensor() : unsupportedSensor;
