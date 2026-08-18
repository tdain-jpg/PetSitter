/**
 * Tilt gesture recognition — pure math over a single pitch angle.
 *
 * The posture we're recognising is the classic one: phone flat against the
 * forehead, screen facing the room, held in landscape. Tilt the top edge down
 * toward the floor to bank a card, tilt it up toward the ceiling to pass.
 *
 * Two decisions worth spelling out:
 *
 * 1. We work from a *calibrated neutral* captured when play starts, not from
 *    an absolute device frame. Absolute beta/gamma at the forehead depends on
 *    how tall the player is and how they hold their arm; deltas from their own
 *    resting position don't.
 * 2. The recogniser is armed/disarmed with hysteresis. Without it, a phone
 *    resting near the threshold machine-guns verdicts as the hand wobbles.
 */

import type { CardVerdict } from './types';

export interface TiltTuning {
  /** Degrees of tilt away from neutral needed to fire a verdict. */
  fireDeg: number;
  /** Must come back inside this band before the next verdict can fire. */
  rearmDeg: number;
}

export const DEFAULT_TILT_TUNING: TiltTuning = { fireDeg: 32, rearmDeg: 14 };

export interface TiltReading {
  /** DeviceOrientation beta: front-to-back tilt, degrees. */
  beta: number;
  /** DeviceOrientation gamma: left-to-right tilt, degrees. */
  gamma: number;
  /** Screen rotation from portrait, degrees: 0, 90, 180 or 270. */
  screenAngle: number;
}

/**
 * Collapse a device-orientation reading into one "pitch" scalar that means the
 * same thing however the screen happens to be rotated.
 *
 * In portrait, front-to-back tilt is beta. Rotate the screen a quarter turn and
 * that same physical motion shows up in gamma instead, with the sign flipping
 * between the two landscape orientations.
 */
export function pitchFrom({ beta, gamma, screenAngle }: TiltReading): number {
  const angle = ((screenAngle % 360) + 360) % 360;
  switch (angle) {
    case 90:
      return -gamma;
    case 270:
      return gamma;
    case 180:
      return -beta;
    default:
      return beta;
  }
}

export interface TiltState {
  /** Pitch captured at calibration; all deltas are measured against it. */
  neutral: number;
  /** False while the phone is still tipped past the fire threshold. */
  armed: boolean;
}

export function calibrate(pitch: number): TiltState {
  return { neutral: pitch, armed: true };
}

export interface TiltStep {
  state: TiltState;
  /** Non-null exactly on the frame a gesture completes. */
  fired: CardVerdict | null;
}

/**
 * Feed one sample in, get the next state and any verdict it triggered.
 *
 * Tilting down (pitch below neutral) is 'hit' — the natural "got it, next"
 * flick. Tilting up is 'pass'.
 */
export function stepTilt(
  state: TiltState,
  pitch: number,
  tuning: TiltTuning = DEFAULT_TILT_TUNING,
): TiltStep {
  const delta = pitch - state.neutral;

  if (!state.armed) {
    // Wait for the phone to come back near neutral before allowing another.
    return Math.abs(delta) <= tuning.rearmDeg
      ? { state: { ...state, armed: true }, fired: null }
      : { state, fired: null };
  }

  if (delta <= -tuning.fireDeg) {
    return { state: { ...state, armed: false }, fired: 'hit' };
  }
  if (delta >= tuning.fireDeg) {
    return { state: { ...state, armed: false }, fired: 'pass' };
  }
  return { state, fired: null };
}
