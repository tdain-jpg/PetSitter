/**
 * Binds the pure round machine to React: a clock, the tilt sensor, haptics and
 * the wake lock.
 *
 * All the rules live in src/core/round.ts. This file only decides *when* to
 * call them, which is why none of the scoring logic appears here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_COUNTDOWN_MS,
  countdownRemaining,
  createRound,
  currentCard,
  mark,
  quit,
  remainingMs,
  tick,
} from '../../core/round';
import { calibrate, pitchFrom, stepTilt, type TiltState } from '../../core/tilt';
import type { CardVerdict, Deck, RoundState } from '../../core/types';
import { haptics } from '../../platform/haptics';
import { tiltSensor } from '../../platform/tiltSensor';
import { wakeLock } from '../../platform/wakeLock';

/** How long the verdict colour covers the screen before the next prompt. */
const FLASH_MS = 550;

/** Clock resolution. Fine enough for a seconds readout, cheap enough to ignore. */
const TICK_MS = 150;

export interface UseRoundOptions {
  deck: Deck;
  durationMs: number;
  /** Whether the player opted into (and was granted) tilt control. */
  tiltEnabled: boolean;
  onFinished: (state: RoundState) => void;
}

export interface UseRound {
  state: RoundState;
  secondsLeft: number;
  countdown: number;
  /** Set for FLASH_MS after a verdict; the card underneath is already the next one. */
  flash: CardVerdict | null;
  markCard: (verdict: CardVerdict) => void;
  abandon: () => void;
}

export function useRound({
  deck,
  durationMs,
  tiltEnabled,
  onFinished,
}: UseRoundOptions): UseRound {
  const [state, setState] = useState<RoundState>(() =>
    createRound(
      { deckId: deck.id, durationMs, countdownMs: DEFAULT_COUNTDOWN_MS },
      deck.cards,
      Date.now(),
      Date.now(),
    ),
  );
  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState<CardVerdict | null>(null);

  // Refs the sensor callback reads. The subscription is set up once, so it
  // cannot close over state without going stale.
  const stateRef = useRef(state);
  stateRef.current = state;
  const flashRef = useRef(flash);
  flashRef.current = flash;

  const finishedRef = useRef(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markCard = useCallback((verdict: CardVerdict) => {
    const current = stateRef.current;
    if (current.phase !== 'playing' || flashRef.current !== null) return;

    const next = mark(current, verdict, Date.now());
    if (next === current) return;

    stateRef.current = next;
    setState(next);

    verdict === 'hit' ? haptics.tap() : haptics.thud();

    flashRef.current = verdict;
    setFlash(verdict);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => {
      flashRef.current = null;
      setFlash(null);
    }, FLASH_MS);
  }, []);

  const abandon = useCallback(() => {
    setState((s) => quit(s));
  }, []);

  // The clock. Ticking stops the moment the round finishes.
  useEffect(() => {
    if (state.phase === 'finished') return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setState((s) => tick(s, t));
    }, TICK_MS);
    return () => clearInterval(id);
  }, [state.phase]);

  // Tilt. Calibration is deferred to the first reading after play starts, so
  // the neutral we capture is the posture the player is actually holding.
  useEffect(() => {
    if (!tiltEnabled) return;

    let tilt: TiltState | null = null;
    let calibratedFor: RoundState['phase'] | null = null;

    return tiltSensor.subscribe((reading) => {
      const current = stateRef.current;
      if (current.phase !== 'playing') {
        // Re-calibrate next time play begins.
        calibratedFor = null;
        return;
      }

      const pitch = pitchFrom(reading);
      if (calibratedFor !== 'playing' || !tilt) {
        tilt = calibrate(pitch);
        calibratedFor = 'playing';
        return;
      }

      // Ignore the sensor while the verdict flash is up, so the flick that
      // banked a card can't also bank the next one.
      if (flashRef.current !== null) {
        tilt = calibrate(tilt.neutral);
        return;
      }

      const step = stepTilt(tilt, pitch);
      tilt = step.state;
      if (step.fired) markCard(step.fired);
    });
  }, [tiltEnabled, markCard]);

  // Keep the screen lit for the duration of the round.
  useEffect(() => {
    void wakeLock.acquire();
    return () => {
      void wakeLock.release();
    };
  }, []);

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  // Hand the finished round up exactly once.
  useEffect(() => {
    if (state.phase !== 'finished' || finishedRef.current) return;
    finishedRef.current = true;
    onFinished(state);
  }, [state, onFinished]);

  const secondsLeft = useMemo(
    () => Math.ceil(remainingMs(state, now) / 1000),
    [state, now],
  );

  return {
    state,
    secondsLeft,
    countdown: countdownRemaining(state, now),
    flash,
    markCard,
    abandon,
  };
}

export { currentCard };
