/**
 * Core domain types.
 *
 * Everything in `src/core` is plain TypeScript: no React, no React Native, no
 * DOM. That is deliberate — this is the layer that survives the PWA -> native
 * pivot untouched, and the layer a future server can import verbatim when
 * land-wide scoring lands (see docs/ARCHITECTURE.md).
 */

export type CardVerdict = 'hit' | 'pass';

export interface Card {
  /** Stable id, unique within its deck. Used for result keys and analytics. */
  id: string;
  /** The word or phrase to act out. Shown huge, read by the room. */
  text: string;
  /** Optional nudge shown small beneath the prompt for the actors. */
  hint?: string;
}

export interface Deck {
  id: string;
  name: string;
  /** One-line pitch shown on the deck picker. */
  tagline: string;
  /** Emoji used as the deck's face on the picker. */
  badge: string;
  cards: Card[];
}

export interface RoundConfig {
  deckId: string;
  /** Length of the playable window, after the countdown. */
  durationMs: number;
  /** "Get it on your forehead" runway before the first card. */
  countdownMs: number;
}

export interface CardResult {
  card: Card;
  verdict: CardVerdict;
  /** Epoch ms the verdict was recorded. */
  at: number;
}

export type RoundPhase = 'countdown' | 'playing' | 'finished';

/**
 * Why a finished round ended — drives the copy on the results screen.
 * 'exhausted' means the player burned the whole deck before the clock ran out,
 * which is worth celebrating rather than reporting as a timeout.
 */
export type RoundEnding = 'expired' | 'exhausted' | 'quit';

export interface RoundState {
  phase: RoundPhase;
  config: RoundConfig;
  /** The shuffled draw pile for this round. Never mutated in place. */
  cards: Card[];
  /** Index of the card currently on screen. */
  cursor: number;
  results: CardResult[];
  /** Epoch ms the countdown began. */
  startedAt: number;
  /** Epoch ms the playable window began; null while still counting down. */
  playStartedAt: number | null;
  ending: RoundEnding | null;
}

export interface ScoreEntry {
  id: string;
  name: string;
  deckId: string;
  score: number;
  /** Cards seen, so a 6/8 reads differently from a 6/20. */
  played: number;
  durationMs: number;
  /** Epoch ms the round finished. */
  at: number;
}
