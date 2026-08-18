/**
 * The app's single wiring point.
 *
 * Screens import `leaderboard` and `settings` from here rather than
 * constructing stores themselves, so pointing the board at a server later is a
 * one-line change in this file.
 */

import { asyncStorageStore } from './storage';
import { createLocalLeaderboard } from './leaderboardStore';

export const leaderboard = createLocalLeaderboard(asyncStorageStore);

const NAME_KEY = 'switchback:player-name';
const PREFS_KEY = 'switchback:prefs';

export interface Preferences {
  deckId: string;
  durationMs: number;
}

export const settings = {
  async playerName(): Promise<string> {
    return (await asyncStorageStore.get(NAME_KEY)) ?? '';
  },
  async setPlayerName(name: string): Promise<void> {
    await asyncStorageStore.set(NAME_KEY, name);
  },

  /**
   * Deck and round length only. Tilt is deliberately not remembered: iOS
   * re-asks for motion permission on every load, and restoring the toggle to
   * "on" would promise a control the app hasn't been granted yet.
   */
  async preferences(): Promise<Partial<Preferences>> {
    const raw = await asyncStorageStore.get(PREFS_KEY);
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? (parsed as Preferences) : {};
    } catch {
      return {};
    }
  },
  async setPreferences(prefs: Preferences): Promise<void> {
    await asyncStorageStore.set(PREFS_KEY, JSON.stringify(prefs));
  },
};
