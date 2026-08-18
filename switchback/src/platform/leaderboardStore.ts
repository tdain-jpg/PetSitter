/**
 * Leaderboard persistence.
 *
 * The interface is async and deck-scoped from day one, which is the shape a
 * remote board needs. v1 ships the local implementation only; swapping in a
 * Supabase-backed one later is a change to this file and nowhere else.
 */

import type { ScoreEntry } from '../core/types';
import { rank, withEntry } from '../core/leaderboard';
import type { KeyValueStore } from './storage';

export interface LeaderboardStore {
  top(deckId: string): Promise<ScoreEntry[]>;
  submit(entry: ScoreEntry): Promise<ScoreEntry[]>;
  clear(deckId: string): Promise<void>;
}

const KEY_PREFIX = 'switchback:board:';

export function createLocalLeaderboard(kv: KeyValueStore): LeaderboardStore {
  const keyFor = (deckId: string) => `${KEY_PREFIX}${deckId}`;

  async function read(deckId: string): Promise<ScoreEntry[]> {
    const raw = await kv.get(keyFor(deckId));
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      // A hand-edited or half-written localStorage value shouldn't take the
      // whole board down; treat anything unexpected as an empty board.
      return Array.isArray(parsed) ? rank(parsed as ScoreEntry[]) : [];
    } catch {
      return [];
    }
  }

  return {
    top: read,
    async submit(entry) {
      const next = withEntry(await read(entry.deckId), entry);
      await kv.set(keyFor(entry.deckId), JSON.stringify(next));
      return next;
    },
    async clear(deckId) {
      await kv.remove(keyFor(deckId));
    },
  };
}
