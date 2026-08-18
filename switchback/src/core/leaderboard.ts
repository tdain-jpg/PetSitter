/**
 * Leaderboard ranking rules.
 *
 * v1 is a single local board per deck. The ranking itself lives here, apart
 * from storage, so the same comparator orders a remote board when park-wide
 * scoring arrives.
 */

import type { ScoreEntry } from './types';

export const BOARD_LIMIT = 25;

/**
 * Highest score first. Ties break toward the player who needed fewer cards to
 * get there, then toward the older run — so beating the board takes beating
 * it, not just matching it.
 */
export function compareEntries(a: ScoreEntry, b: ScoreEntry): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.played !== b.played) return a.played - b.played;
  return a.at - b.at;
}

export function rank(entries: readonly ScoreEntry[]): ScoreEntry[] {
  return entries.slice().sort(compareEntries);
}

/** Insert a new run and trim to the board limit. */
export function withEntry(
  entries: readonly ScoreEntry[],
  entry: ScoreEntry,
): ScoreEntry[] {
  return rank([...entries, entry]).slice(0, BOARD_LIMIT);
}

/** 1-based placement of `entry` once inserted, or null if it misses the board. */
export function placementOf(
  entries: readonly ScoreEntry[],
  entry: ScoreEntry,
): number | null {
  const index = withEntry(entries, entry).findIndex((e) => e.id === entry.id);
  return index === -1 ? null : index + 1;
}
