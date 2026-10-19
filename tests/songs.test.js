import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMidi } from '../js/songs/midi.js';
import { textSong, mkSong } from '../js/songs/text.js';
import { Library, b64, unb64 } from '../js/songs/library.js';
import { parseNote } from '../js/util.js';
import { midiFile, track, tempoEvent } from './helpers.js';

test('parseNote reads note names', () => {
  assert.equal(parseNote('C4'), 60);
  assert.equal(parseNote('A4'), 69);
  assert.equal(parseNote('C#4'), 61);
  assert.equal(parseNote('Bb3'), 58);
  assert.equal(parseNote('H4'), null);
});

test('textSong: chords, lengths and rests', () => {
  const s = textSong('x', 'C4 E4+C3:2 _ G4:2');
  const at = t => s.notes.filter(n => n.t === t).map(n => n.m).sort();
  assert.deepEqual(at(0), [60]);
  assert.deepEqual(at(1), [48, 64]); // chord
  assert.equal(s.notes.find(n => n.m === 48).d, 1.9); // its own length
  assert.deepEqual(at(3), [67]); // the rest took one beat (token 3), then G4
  assert.equal(s.notes.find(n => n.m === 48).h, 'L'); // low notes are the left hand
});

test('textSong: the song moves on by the first note of a chord', () => {
  const s = textSong('x', 'E4:1.5+C3:3 D4');
  assert.equal(s.notes.find(n => n.m === 62).t, 1.5);
});

test('mkSong starts at beat 0 and rejects empty songs', () => {
  const s = mkSong('x', 70, [{ t: 4, d: 1, m: 60, h: 'R' }, { t: 6, d: 1, m: 62, h: 'R' }]);
  assert.deepEqual(s.notes.map(n => n.t), [0, 2]);
  assert.throws(() => mkSong('x', 70, []), /No notes/);
});

test('parseMidi: two separate tracks become right and left hand, with tempo', () => {
  const right = track([72, 74, 76], 480, 400, tempoEvent(100));
  const left = track([48, 52, 55], 960, 900);
  const s = parseMidi(midiFile([right, left]), 'two');
  assert.equal(s.bpm, 100);
  assert.equal(s.notes.length, 6);
  assert.ok(s.notes.filter(n => n.m >= 72).every(n => n.h === 'R'));
  assert.ok(s.notes.filter(n => n.m <= 55).every(n => n.h === 'L'));
  const n2 = s.notes.find(n => n.m === 74);
  assert.equal(n2.t, 1); // second beat
  assert.ok(Math.abs(n2.d - 400 / 480) < 1e-9);
});

test('parseMidi: a single track is split at middle C', () => {
  const s = parseMidi(midiFile([track([48, 72], 480, 400)]), 'one');
  assert.deepEqual(s.notes.map(n => n.h), ['L', 'R']);
});

test('parseMidi: many tracks fall back to a pitch split (not "everything is the left hand")', () => {
  const s = parseMidi(midiFile([track([84, 86], 480, 400), track([72, 74], 480, 400), track([48, 50], 480, 400)]), 'three');
  assert.ok(s.notes.some(n => n.h === 'R'));
  assert.ok(s.notes.some(n => n.h === 'L'));
  assert.ok(s.notes.filter(n => n.m >= 60).every(n => n.h === 'R'));
});

test('parseMidi rejects files that are not MIDI', () => {
  assert.throws(() => parseMidi(new TextEncoder().encode('hello world, not midi').buffer, 'x'), /Not a MIDI/);
});

test('b64 round-trips binary data', () => {
  const buf = new Uint8Array([0, 1, 2, 250, 255, 128]).buffer;
  assert.deepEqual([...new Uint8Array(unb64(b64(buf)))], [0, 1, 2, 250, 255, 128]);
});

test('Library stores imported songs and finds them by stable key', () => {
  const store = new Map();
  const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const lib = new Library(storage);
  assert.ok(lib.options().some(o => o.value === 'b:Ode to Joy'));
  lib.add({ name: 'Mine', kind: 'text', data: 'C4 D4' });
  lib.add({ name: 'Other', kind: 'text', data: 'E4' });
  assert.equal(lib.keyOf('c:1'), 'c:Other');
  assert.equal(lib.valueOf('c:Other'), 'c:1');
  lib.remove(0); // indexes shift, the key still finds the song
  assert.equal(lib.valueOf('c:Other'), 'c:0');
  assert.equal(lib.valueOf('c:Mine'), null);
  assert.equal(new Library(storage).customs.length, 1); // persisted
  assert.equal(lib.source('c:0').notes.length, 1);
});
