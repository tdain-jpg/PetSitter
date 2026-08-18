/**
 * The round: a pure state machine.
 *
 * The UI owns the clock and feeds `now` in on every transition. Nothing here
 * reads Date.now() itself, which is what makes the whole loop testable without
 * a device, a timer, or a rendered tree.
 */

import type {
  Card,
  CardVerdict,
  RoundConfig,
  RoundEnding,
  RoundState,
} from './types';
import { shuffle } from './rng';

export const DEFAULT_COUNTDOWN_MS = 3000;

/** Round lengths offered on the pre-game screen. */
export const DURATION_CHOICES_MS = [60_000, 90_000, 120_000] as const;

export function createRound(
  config: RoundConfig,
  deckCards: readonly Card[],
  seed: number,
  now: number,
): RoundState {
  return {
    phase: 'countdown',
    config,
    cards: shuffle(deckCards, seed),
    cursor: 0,
    results: [],
    startedAt: now,
    playStartedAt: null,
    ending: null,
  };
}

/**
 * Advance the clock. Idempotent for a given `now`, so the UI can call it on
 * every animation frame without the state churning.
 */
export function tick(state: RoundState, now: number): RoundState {
  if (state.phase === 'countdown') {
    const playStartsAt = state.startedAt + state.config.countdownMs;
    if (now < playStartsAt) return state;
    // Anchor the playable window to the scheduled start, not to `now`, so a
    // late tick doesn't hand the player extra seconds.
    return { ...state, phase: 'playing', playStartedAt: playStartsAt };
  }

  if (state.phase === 'playing') {
    if (now < endsAt(state)) return state;
    return { ...state, phase: 'finished', ending: 'expired' };
  }

  return state;
}

/** Record a verdict for the visible card and advance to the next one. */
export function mark(
  state: RoundState,
  verdict: CardVerdict,
  now: number,
): RoundState {
  if (state.phase !== 'playing') return state;

  const card = currentCard(state);
  if (!card) return state;

  const results = [...state.results, { card, verdict, at: now }];
  const cursor = state.cursor + 1;

  // Burning the whole deck ends the round early, and reads as a win rather
  // than a timeout.
  if (cursor >= state.cards.length) {
    return { ...state, cursor, results, phase: 'finished', ending: 'exhausted' };
  }

  return { ...state, cursor, results };
}

/** Player backed out mid-round. Keeps the results collected so far. */
export function quit(state: RoundState): RoundState {
  if (state.phase === 'finished') return state;
  return { ...state, phase: 'finished', ending: 'quit' };
}

export function currentCard(state: RoundState): Card | null {
  return state.cards[state.cursor] ?? null;
}

/** Epoch ms the playable window closes. Falls back to the scheduled start. */
export function endsAt(state: RoundState): number {
  const start = state.playStartedAt ?? state.startedAt + state.config.countdownMs;
  return start + state.config.durationMs;
}

export function remainingMs(state: RoundState, now: number): number {
  if (state.phase === 'countdown') return state.config.durationMs;
  if (state.phase === 'finished') {
    // Freeze the clock at whatever was left when the round ended.
    return state.ending === 'expired' ? 0 : Math.max(0, endsAt(state) - lastEventAt(state, now));
  }
  return Math.max(0, endsAt(state) - now);
}

/** Whole seconds left on the countdown, 3..1. */
export function countdownRemaining(state: RoundState, now: number): number {
  const playStartsAt = state.startedAt + state.config.countdownMs;
  return Math.max(0, Math.ceil((playStartsAt - now) / 1000));
}

export function score(state: RoundState): number {
  return state.results.reduce((n, r) => (r.verdict === 'hit' ? n + 1 : n), 0);
}

export function played(state: RoundState): number {
  return state.results.length;
}

function lastEventAt(state: RoundState, fallback: number): number {
  const last = state.results[state.results.length - 1];
  return last ? last.at : fallback;
}
