/**
 * Key-value persistence behind an interface.
 *
 * AsyncStorage already works on both web (localStorage) and native, so the
 * indirection isn't about today — it's so the leaderboard can be repointed at
 * a server without any screen knowing.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export const asyncStorageStore: KeyValueStore = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
};

/** Used by tests and by any environment without a storage backend. */
export function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    async get(key) {
      return map.get(key) ?? null;
    },
    async set(key, value) {
      map.set(key, value);
    },
    async remove(key) {
      map.delete(key);
    },
  };
}
