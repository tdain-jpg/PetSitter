import assert from 'node:assert/strict';
import { test } from 'node:test';

import { BOARD_LIMIT, placementOf, rank, withEntry } from '../src/core/leaderboard';
import { createLocalLeaderboard } from '../src/platform/leaderboardStore';
import { createMemoryStore } from '../src/platform/storage';
import type { ScoreEntry } from '../src/core/types';

function entry(over: Partial<ScoreEntry> = {}): ScoreEntry {
  return {
    id: 'e1',
    name: 'Sam',
    deckId: 'ride-it',
    score: 10,
    played: 14,
    durationMs: 60_000,
    at: 1_000,
    ...over,
  };
}

test('higher score wins, then fewer cards, then the earlier run', () => {
  const low = entry({ id: 'low', score: 8 });
  const efficient = entry({ id: 'efficient', score: 10, played: 11 });
  const wasteful = entry({ id: 'wasteful', score: 10, played: 20 });
  const older = entry({ id: 'older', score: 10, played: 11, at: 500 });

  const ordered = rank([low, wasteful, efficient, older]).map((e) => e.id);
  assert.deepEqual(ordered, ['older', 'efficient', 'wasteful', 'low']);
});

test('the board is capped and drops the weakest run', () => {
  const many = Array.from({ length: BOARD_LIMIT + 5 }, (_, i) =>
    entry({ id: `e${i}`, score: i }),
  );
  const board = many.reduce<ScoreEntry[]>((acc, e) => withEntry(acc, e), []);
  assert.equal(board.length, BOARD_LIMIT);
  assert.equal(board[0].score, BOARD_LIMIT + 4);
  assert.ok(!board.some((e) => e.score < 5));
});

test('placement reports where a run lands, or nothing if it misses', () => {
  const board = [entry({ id: 'a', score: 20 }), entry({ id: 'b', score: 5 })];
  assert.equal(placementOf(board, entry({ id: 'c', score: 12 })), 2);
  assert.equal(placementOf(board, entry({ id: 'd', score: 1 })), 3);
});

test('the local store round-trips and keeps decks apart', async () => {
  const store = createLocalLeaderboard(createMemoryStore());
  await store.submit(entry({ id: 'a', score: 9 }));
  await store.submit(entry({ id: 'b', score: 15 }));
  await store.submit(entry({ id: 'c', deckId: 'snack-bar', score: 99 }));

  const rideIt = await store.top('ride-it');
  assert.deepEqual(rideIt.map((e) => e.id), ['b', 'a']);
  assert.equal((await store.top('snack-bar')).length, 1);
  assert.deepEqual(await store.top('queue-life'), []);
});

test('corrupt stored data reads as an empty board rather than throwing', async () => {
  const kv = createMemoryStore();
  await kv.set('switchback:board:ride-it', '{not json');
  const store = createLocalLeaderboard(kv);
  assert.deepEqual(await store.top('ride-it'), []);
});

test('clearing a deck leaves the others alone', async () => {
  const store = createLocalLeaderboard(createMemoryStore());
  await store.submit(entry({ id: 'a' }));
  await store.submit(entry({ id: 'c', deckId: 'snack-bar' }));
  await store.clear('ride-it');
  assert.deepEqual(await store.top('ride-it'), []);
  assert.equal((await store.top('snack-bar')).length, 1);
});
