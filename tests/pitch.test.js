import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPitch } from '../js/pitch.js';
import { hz } from '../js/util.js';

const SR = 44100;

/** A tone with a few harmonics, like a plucked or struck string. */
function tone(freq, { n = 4096, harmonics = [1, 0.6, 0.35, 0.2], amp = 0.3 } = {}) {
  const b = new Float32Array(n);
  harmonics.forEach((a, k) => {
    for (let i = 0; i < n; i++) b[i] += amp * a * Math.sin(2 * Math.PI * freq * (k + 1) * i / SR);
  });
  return b;
}

test('detects notes from about A#1 to G#6', () => {
  for (const midi of [34, 36, 48, 60, 69, 72, 84, 92]) {
    const r = detectPitch(tone(hz(midi)), SR, 0.01);
    assert.equal(r.midi, midi, `expected ${midi}, got ${r.midi}`);
  }
});

test('detects a pure sine', () => {
  const r = detectPitch(tone(440, { harmonics: [1] }), SR, 0.01);
  assert.equal(r.midi, 69);
});

test('a note slightly out of tune still rounds to the nearest note', () => {
  const r = detectPitch(tone(440 * 2 ** (20 / 1200)), SR, 0.01); // +20 cents
  assert.equal(r.midi, 69);
});

test('silence and quiet noise are ignored by the volume gate', () => {
  assert.equal(detectPitch(new Float32Array(4096), SR, 0.01).midi, undefined);
  const quiet = tone(440, { amp: 0.005 });
  assert.equal(detectPitch(quiet, SR, 0.02).midi, undefined);
});

test('lowering the threshold lets a soft note through', () => {
  const soft = tone(440, { amp: 0.01 });
  assert.equal(detectPitch(soft, SR, 0.05).midi, undefined);
  assert.equal(detectPitch(soft, SR, 0.002).midi, 69);
});
