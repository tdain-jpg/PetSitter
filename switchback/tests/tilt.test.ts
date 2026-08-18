import assert from 'node:assert/strict';
import { test } from 'node:test';

import { calibrate, pitchFrom, stepTilt } from '../src/core/tilt';

test('pitch means the same thing in every screen rotation', () => {
  const beta = 40;
  const gamma = 25;
  assert.equal(pitchFrom({ beta, gamma, screenAngle: 0 }), 40);
  assert.equal(pitchFrom({ beta, gamma, screenAngle: 90 }), -25);
  assert.equal(pitchFrom({ beta, gamma, screenAngle: 270 }), 25);
  assert.equal(pitchFrom({ beta, gamma, screenAngle: 180 }), -40);
  // Negative and out-of-range angles normalise rather than falling through.
  assert.equal(pitchFrom({ beta, gamma, screenAngle: -90 }), 25);
  assert.equal(pitchFrom({ beta, gamma, screenAngle: 450 }), -25);
});

test('tilting down banks a card, tilting up passes', () => {
  const neutral = calibrate(70);
  assert.equal(stepTilt(neutral, 70 - 40).fired, 'hit');
  assert.equal(stepTilt(neutral, 70 + 40).fired, 'pass');
});

test('small wobble near neutral fires nothing', () => {
  const neutral = calibrate(70);
  for (const pitch of [70, 78, 62, 85, 55]) {
    assert.equal(stepTilt(neutral, pitch).fired, null);
  }
});

test('a held tilt fires once, not once per sample', () => {
  let state = calibrate(0);
  const first = stepTilt(state, -40);
  assert.equal(first.fired, 'hit');
  state = first.state;

  // Still tipped over: no repeat verdicts while the hand lingers.
  for (const pitch of [-45, -60, -38, -33]) {
    const step = stepTilt(state, pitch);
    assert.equal(step.fired, null);
    state = step.state;
  }

  // Halfway back is not enough to re-arm.
  state = stepTilt(state, -20).state;
  assert.equal(stepTilt(state, -40).fired, null);

  // Back inside the re-arm band, then the next flick counts.
  state = stepTilt(state, -5).state;
  assert.equal(stepTilt(state, -40).fired, 'hit');
});

test('calibration is relative, so any resting posture works', () => {
  // A player holding the phone at a steep angle gets the same behaviour.
  const steep = calibrate(-115);
  assert.equal(stepTilt(steep, -115).fired, null);
  assert.equal(stepTilt(steep, -155).fired, 'hit');
  assert.equal(stepTilt(steep, -75).fired, 'pass');
});
