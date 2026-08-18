import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DECKS, deckById } from '../src/core/decks';
import { shuffle } from '../src/core/rng';

test('every deck has enough cards to outlast a long round', () => {
  for (const deck of DECKS) {
    // Two minutes at a brisk five seconds a card is 24.
    assert.ok(deck.cards.length >= 24, `${deck.id} has ${deck.cards.length}`);
  }
});

test('card ids are unique across every deck', () => {
  const ids = DECKS.flatMap((d) => d.cards.map((c) => c.id));
  assert.equal(new Set(ids).size, ids.length);
});

test('no prompt carries a third-party name', () => {
  // A cheap guard on the one rule the content has to hold to.
  const banned = /disney|pixar|marvel|star wars|universal|mickey|dole whip/i;
  for (const deck of DECKS) {
    for (const card of deck.cards) {
      assert.ok(!banned.test(card.text), `${card.id}: ${card.text}`);
      assert.ok(!banned.test(card.hint ?? ''), `${card.id} hint`);
    }
  }
});

test('deckById finds real decks and nothing else', () => {
  assert.equal(deckById('ride-it')?.name, 'Ride It');
  assert.equal(deckById('nope'), undefined);
});

test('shuffle is deterministic per seed and keeps every card', () => {
  const cards = DECKS[0].cards;
  assert.deepEqual(shuffle(cards, 42), shuffle(cards, 42));
  assert.notDeepEqual(shuffle(cards, 42), shuffle(cards, 43));
  assert.deepEqual(
    shuffle(cards, 42).map((c) => c.id).sort(),
    cards.map((c) => c.id).sort(),
  );
});
