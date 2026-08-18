import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  createRound,
  currentCard,
  countdownRemaining,
  mark,
  quit,
  remainingMs,
  score,
  tick,
} from '../src/core/round';
import type { Card, RoundConfig } from '../src/core/types';

const CONFIG: RoundConfig = {
  deckId: 'test',
  durationMs: 60_000,
  countdownMs: 3_000,
};

const CARDS: Card[] = Array.from({ length: 5 }, (_, i) => ({
  id: `c${i}`,
  text: `card ${i}`,
}));

const T0 = 1_000_000;

function playing() {
  return tick(createRound(CONFIG, CARDS, 7, T0), T0 + 3_000);
}

test('starts in countdown and does not deal a card early', () => {
  const state = createRound(CONFIG, CARDS, 7, T0);
  assert.equal(state.phase, 'countdown');
  assert.equal(countdownRemaining(state, T0), 3);
  assert.equal(countdownRemaining(state, T0 + 2_100), 1);
  // Marks are ignored until play actually starts.
  assert.equal(score(mark(state, 'hit', T0 + 500)), 0);
});

test('countdown hands off to play at the scheduled instant', () => {
  const late = tick(createRound(CONFIG, CARDS, 7, T0), T0 + 3_400);
  assert.equal(late.phase, 'playing');
  // A late tick must not extend the playable window past its schedule.
  assert.equal(remainingMs(late, T0 + 3_400), 59_600);
});

test('marking advances the cursor and scores only hits', () => {
  let state = playing();
  const first = currentCard(state);
  state = mark(state, 'hit', T0 + 4_000);
  state = mark(state, 'pass', T0 + 5_000);

  assert.equal(score(state), 1);
  assert.equal(state.results.length, 2);
  assert.equal(state.results[0].card.id, first?.id);
  assert.notEqual(currentCard(state)?.id, first?.id);
});

test('burning the deck ends the round as exhausted, not expired', () => {
  let state = playing();
  for (let i = 0; i < CARDS.length; i++) {
    state = mark(state, 'hit', T0 + 4_000 + i);
  }
  assert.equal(state.phase, 'finished');
  assert.equal(state.ending, 'exhausted');
  assert.equal(score(state), 5);
  assert.equal(currentCard(state), null);
  // Time was still on the clock when they cleared it.
  assert.ok(remainingMs(state, T0 + 10_000) > 0);
});

test('the clock expires the round and freezes at zero', () => {
  const state = tick(playing(), T0 + 63_001);
  assert.equal(state.phase, 'finished');
  assert.equal(state.ending, 'expired');
  assert.equal(remainingMs(state, T0 + 99_999), 0);
});

test('a finished round ignores further marks and ticks', () => {
  const finished = tick(playing(), T0 + 63_001);
  assert.equal(score(mark(finished, 'hit', T0 + 64_000)), 0);
  assert.equal(tick(finished, T0 + 90_000).phase, 'finished');
});

test('quitting keeps the results collected so far', () => {
  const state = quit(mark(playing(), 'hit', T0 + 4_000));
  assert.equal(state.phase, 'finished');
  assert.equal(state.ending, 'quit');
  assert.equal(score(state), 1);
});

test('tick is idempotent for a given instant', () => {
  const once = tick(createRound(CONFIG, CARDS, 7, T0), T0 + 3_000);
  assert.equal(tick(once, T0 + 3_000), once);
});
