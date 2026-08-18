/**
 * Deterministic shuffling.
 *
 * Rounds seed from the clock in production, but every seed is an explicit
 * argument so tests (and, later, "everyone in this queue gets the same draw"
 * shared rounds) can pin the order.
 */

/** mulberry32 — small, fast, good enough for card order. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates. Returns a new array; the input is left alone. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const rng = createRng(seed);
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
