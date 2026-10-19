import test from 'node:test';
import assert from 'node:assert/strict';
import { Practice } from '../js/engine.js';
import { song } from './helpers.js';

/** An engine with a controllable clock and a log of what it asked the page to do. */
function setup(src, opts = {}) {
  const clock = { t: 10000 }; // the mic ignores input within 300 ms of "time zero"
  const log = { status: [], flash: [], on: [], off: [], demoKeys: [], start: [], listen: [] };
  const e = new Practice({
    status: t => log.status.push(t),
    flash: (m, k) => log.flash.push([m, k]),
    voiceOn: (m, k) => log.on.push([m, k]),
    voiceOff: k => log.off.push(k),
    demoKey: (n, on) => log.demoKeys.push([n.m, on]),
    start: t => log.start.push(t),
    listen: (t, on) => log.listen.push([t, on]),
    notice: () => log.notice = true,
  }, () => clock.t);
  Object.assign(e, { hold: false, ...opts });
  e.load(src);
  return { e, clock, log, advance(ms) { clock.t += ms; e.tick(); } };
}

const melody = () => song([[0, 64], [1, 62], [2, 60], [3, 62]]);
// right hand on the beat, left hand on beats 0 and 2
const twoHands = () => song([[0, 64, 'R'], [0, 48, 'L'], [1, 62, 'R'], [2, 60, 'R'], [2, 43, 'L'], [3, 62, 'R'], [4, 60, 'R']]);

test('Wait mode advances on the right note, in any octave', () => {
  const { e } = setup(melody());
  e.input(76, 'qwerty', 'a'); // E5 matches E4
  assert.equal(e.idx, 1);
  assert.equal(e.hits, 1);
  assert.equal(e.streak, 1);
});

test('Wait mode: a wrong note does not advance and resets the streak', () => {
  const { e } = setup(melody());
  e.input(64, 'qwerty', 'a');
  e.input(61, 'qwerty', 'b');
  assert.equal(e.idx, 1);
  assert.equal(e.streak, 0);
  assert.equal(e.stats().accuracy, '50%');
});

test('Wait mode: a chord needs every note, in any order', () => {
  const { e } = setup(twoHands());
  e.input(48, 'qwerty', 'a');
  assert.equal(e.idx, 0); // right-hand note still missing
  e.input(64, 'qwerty', 'b');
  assert.equal(e.idx, 1);
});

test('Wait mode: the mic hears one note, so one note of a chord counts the whole chord', () => {
  const { e } = setup(twoHands());
  e.input(64, 'mic', 'mic');
  assert.equal(e.idx, 1);
  assert.equal(e.hits, 2);
});

test('Wait mode: the song finishes', () => {
  const { e, log } = setup(melody());
  for (const m of [64, 62, 60, 62]) e.input(m, 'qwerty', 'k' + m);
  assert.equal(e.idx, 4);
  assert.ok(log.status.includes('🎉 Song complete!'));
});

test('Holding: a note counts only after it has been held long enough', () => {
  const { e, advance } = setup(melody(), { hold: true });
  e.input(64, 'qwerty', 'a');
  assert.equal(e.results[0], 'holding');
  assert.equal(e.idx, 0);
  advance(300);
  assert.equal(e.idx, 0); // 0.9 beat at 70 bpm is ~771 ms; 70% is ~540 ms
  advance(400);
  assert.equal(e.results[0], 'hit');
  assert.equal(e.idx, 1);
});

test('Holding: letting go early means playing the note again', () => {
  const { e, advance } = setup(melody(), { hold: true });
  e.input(64, 'qwerty', 'a');
  advance(100);
  e.release('a');
  assert.equal(e.results[0], null);
  assert.equal(e.idx, 0);
  assert.equal(e.streak, 0);
  e.input(64, 'qwerty', 'b');
  advance(800);
  assert.equal(e.idx, 1);
});

test('Holding: a held mic note ends when the mic stops hearing it', () => {
  const { e, advance } = setup(melody(), { hold: true });
  e.input(64, 'mic', 'mic');
  advance(100);
  e.micHeld(64);
  advance(200);
  assert.equal(e.results[0], 'holding');
  advance(300); // 300 ms with no more readings
  assert.equal(e.results[0], null);
});

test('Switching hands keeps your place and your score', () => {
  const { e } = setup(twoHands());
  e.input(64, 'qwerty', 'a'); e.input(48, 'qwerty', 'b');
  e.input(62, 'qwerty', 'c');
  assert.equal(e.idx, 2);
  assert.equal(e.hits, 3);

  e.hands = 'right'; e.changeHands();
  assert.equal(e.notes.every(n => n.h === 'R'), true);
  assert.equal(e.notes[e.steps[e.idx].ns[0]].t, 2, 'still at beat 2');
  assert.equal(e.hits, 2); // the two right-hand notes you played

  e.hands = 'left'; e.changeHands();
  assert.equal(e.steps[e.idx].t, 2);
  assert.equal(e.hits, 1);

  e.hands = 'both'; e.changeHands();
  assert.equal(e.idx, 2);
  assert.equal(e.hits, 3, 'everything you played is remembered');
  assert.equal(e.waitT, 2);
});

test('Switching hands to one with nothing to play shows a notice and falls back to both', () => {
  const { e, log } = setup(melody());
  e.hands = 'left'; e.changeHands();
  assert.equal(e.hands, 'both');
  assert.ok(log.notice);
  assert.ok(e.notes.length > 0);
});

test('Only restart() starts over', () => {
  const { e } = setup(twoHands());
  e.input(64, 'qwerty', 'a'); e.input(48, 'qwerty', 'b');
  e.hands = 'right'; e.changeHands();
  assert.equal(e.idx > 0, true);
  e.restart();
  assert.equal(e.idx, 0);
  assert.equal(e.hits, 0);
});

test('seekTo starts from a point: earlier notes are skipped and the score restarts', () => {
  const { e } = setup(melody());
  e.input(64, 'qwerty', 'a');
  e.seekTo(2);
  assert.equal(e.idx, 2);
  assert.equal(e.waitT, 2);
  assert.deepEqual(e.results.slice(0, 2), ['skip', 'skip']);
  assert.equal(e.hits, 0);
  e.input(60, 'qwerty', 'b');
  assert.equal(e.idx, 3);
});

test('stepBy moves one step at a time and stays in range', () => {
  const { e } = setup(melody());
  e.stepBy(1); assert.equal(e.idx, 1);
  e.stepBy(10); assert.equal(e.idx, 3);
  e.stepBy(-10); assert.equal(e.idx, 0);
});

test('Play at tempo: hits within the window, misses when late, summary at the end', () => {
  const { e, clock, log } = setup(melody());
  e.setMode('tempo');
  assert.equal(e.pos, -2); // count-in
  e.toggleRun();
  const start = clock.t, beat = e.beatMs();
  const go = p => { clock.t = start + (p + 2) * beat; e.tick(); }; // move to song position p (in beats)

  go(0);
  e.input(64, 'qwerty', 'a');
  assert.equal(e.results[0], 'hit');

  go(1);
  e.input(61, 'qwerty', 'b'); // wrong note
  assert.equal(e.streak, 0);

  go(1.6); // the note at beat 1 is now more than 0.4 beats late
  assert.equal(e.results[1], 'miss');

  go(2.1);
  e.input(60, 'qwerty', 'c'); // a little late but inside the window
  assert.equal(e.results[2], 'hit');

  go(20);
  assert.equal(e.done, true);
  assert.equal(e.results[3], 'miss');
  assert.equal(e.hits, 2);
  assert.ok(log.status.at(-1).startsWith('Finished: 2 of 4'));
});

test('Play at tempo: notes are ignored until you press Start', () => {
  const { e } = setup(melody());
  e.setMode('tempo');
  e.input(64, 'qwerty', 'a');
  assert.equal(e.hits, 0);
  assert.equal(e.total, 0);
});

test('Play at tempo: jumping ahead adds a count-in when you press Start', () => {
  const { e } = setup(melody());
  e.setMode('tempo');
  e.seekTo(2);
  assert.equal(e.pos, 2);
  e.toggleRun();
  assert.equal(e.pos, 0);
});

test('Switching hands while running keeps the position', () => {
  const { e, clock } = setup(twoHands());
  e.setMode('tempo');
  e.toggleRun();
  clock.t += 5.5 * e.beatMs(); e.tick();
  const p = e.pos;
  e.hands = 'right'; e.changeHands();
  assert.equal(e.running, true);
  assert.equal(e.pos, p);
});

test('Listen plays the notes on time, pause silences them, stop returns to your place', () => {
  const { e, clock, log } = setup(melody());
  e.input(64, 'qwerty', 'a');
  const hits = e.hits, idx = e.idx, pos = e.pos;

  e.toggleDemo(); // starts from your step (beat 1) with a one-beat lead-in
  assert.equal(e.demo.on, true);
  const beat = e.beatMs();
  clock.t += 1.1 * beat; e.tick();
  assert.deepEqual(log.on.map(x => x[0]), [62]); // beat 1 note started

  e.toggleDemo(); // pause
  assert.equal(e.demo.paused, true);
  assert.equal(log.off.length, 1);
  const frozen = e.pos;
  clock.t += 5 * beat; e.tick();
  assert.equal(e.pos, frozen);

  e.toggleDemo(); // resume re-sounds the note that was playing
  assert.equal(e.demo.paused, false);
  assert.equal(log.on.length, 2);

  e.killDemo();
  assert.equal(e.demo.on, false);
  assert.equal(e.pos, pos);
  assert.equal(e.hits, hits);
  assert.equal(e.idx, idx);
});

test('Listen follows the selected hand', () => {
  const { e, clock, log } = setup(twoHands());
  e.hands = 'left'; e.changeHands();
  e.toggleDemo();
  clock.t += 10 * e.beatMs(); e.tick();
  assert.ok(log.on.length > 0);
  assert.ok(log.on.every(([m]) => m < 60));
});

test('Playing a key while Listen is paused hands control back', () => {
  const { e } = setup(melody());
  e.toggleDemo();
  e.toggleDemo(); // pause
  e.input(64, 'qwerty', 'a');
  assert.equal(e.demo.on, false);
  assert.equal(e.hits, 1);
});

test('changing tempo mid-song keeps the position', () => {
  const { e, clock } = setup(melody());
  e.setMode('tempo');
  e.toggleRun();
  clock.t += 6 * e.beatMs(); e.tick();
  const p = e.pos;
  e.setBpm(140);
  e.tick();
  assert.ok(Math.abs(e.pos - p) < 1e-9);
});

test('Switching hands while Listen plays is seamless: no stop, the other hand just goes quiet', () => {
  const { e, clock, log } = setup(twoHands());
  e.toggleDemo();
  const beat = e.beatMs();
  clock.t += 1.2 * beat; e.tick(); // beat 0.2: the beat-0 right and left notes are sounding
  assert.deepEqual(log.on.map(x => x[0]).sort(), [48, 64]);
  const pos = e.pos;

  e.hands = 'right'; e.changeHands();
  assert.equal(e.demo.on, true, 'still listening');
  assert.equal(e.demo.paused, false);
  assert.equal(e.pos, pos, 'same place');
  assert.equal(log.off.length, 1, 'only the left-hand note was cut');
  assert.equal(log.on.length, 2, 'the right-hand note was not retriggered');

  clock.t += 1 * beat; e.tick(); // beat 1.2: right-hand note at beat 1 starts, left hand stays quiet
  assert.deepEqual(log.on.map(x => x[0]).sort((a, b) => a - b), [48, 62, 64]);

  e.hands = 'both'; e.changeHands(); // left hand comes back
  clock.t += 1 * beat; e.tick(); // beat 2.2
  assert.ok(log.on.some(([m]) => m === 43), 'left-hand note at beat 2 sounds');
  assert.equal(e.demo.on, true);
});

test('Switching hands while Listen is playing a held left-hand note starts it mid-way', () => {
  const s = song([[0, 60, 'R'], [0, 40, 'L'], [6, 62, 'R']]);
  s.notes[1].d = 4; // a long bass note
  const { e, clock, log } = setup(s);
  e.hands = 'right'; e.changeHands();
  e.toggleDemo();
  clock.t += 2 * e.beatMs(); e.tick(); // beat 1: only the right-hand note was played
  assert.deepEqual(log.on.map(x => x[0]), [60]);
  e.hands = 'both'; e.changeHands();
  assert.ok(log.on.some(([m]) => m === 40), 'the bass note that should be sounding now starts');
});

test('Switching hands while Listen is paused stays paused and silent', () => {
  const { e, clock, log } = setup(twoHands());
  e.toggleDemo();
  clock.t += 1.2 * e.beatMs(); e.tick();
  e.toggleDemo(); // pause
  const on = log.on.length;
  e.hands = 'right'; e.changeHands();
  assert.equal(e.demo.paused, true);
  assert.equal(log.on.length, on);
  e.toggleDemo(); // resume: only the right-hand note comes back
  assert.deepEqual(log.on.slice(on).map(x => x[0]), [64]);
});

test('Practice progress is untouched by switching hands during Listen', () => {
  const { e } = setup(twoHands());
  e.input(64, 'qwerty', 'a'); e.input(48, 'qwerty', 'b');
  const idx = e.idx;
  e.toggleDemo();
  e.hands = 'right'; e.changeHands();
  e.killDemo();
  assert.equal(e.waitT, 1);
  assert.equal(e.steps[e.idx].t, 1);
  assert.equal(e.hits, 1); // the right-hand note you played
  assert.ok(idx >= 1);
});
