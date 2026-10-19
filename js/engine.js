// The practice engine: song position, scoring, hold tracking, seeking and the "listen" playback.
// It has no DOM or audio code. Everything it needs from the outside goes through `hooks`
// (status text, key flashes, sound on/off ...) and a clock, so it can be tested in Node.
import { clamp } from './util.js';

export const WIN = 0.4; // Play-at-tempo hit window, in beats either side of a note
const noop = () => {};

export class Practice {
  constructor(hooks = {}, now = () => performance.now()) {
    this.h = {
      status: noop, stats: noop, target: noop, start: noop, listen: noop, flash: noop,
      voiceOn: noop, voiceOff: noop, demoKey: noop, legend: noop, changed: noop, notice: noop,
      ...hooks,
    };
    this.now = now;

    // settings the UI changes
    this.mode = 'wait'; // 'wait' | 'tempo'
    this.hands = 'both'; // 'both' | 'right' | 'left'
    this.split = 'auto'; // 'auto' or the MIDI note below which notes are the left hand
    this.bpm = 70;
    this.hold = true; // Wait mode: hold notes for their length
    this.wrongFx = false;

    // song and progress
    this.src = null;
    this.notes = []; // [{t,d,m,h,step}] for the selected hands, sorted by time
    this.steps = []; // [{t, ns:[note indexes]}] notes that start together
    this.results = []; // per note: undefined | 'hit' | 'miss' | 'holding' | 'skip'
    this.progress = new Map(); // scored notes by "time:pitch", survives switching hands
    this.presses = new Map(); // held keys waiting for their hold time
    this.hits = 0; this.total = 0; this.correct = 0; this.streak = 0;
    this.endT = 0;

    // position
    this.pos = 0; // beat shown on the roll
    this.idx = 0; // Wait mode: current step
    this.waitT = 0; // Wait mode: beat of the current step (hand-independent)
    this.running = false; this.done = false; this.countIn = false;
    this.t0 = 0; this.scanFrom = 0; this.lastMatch = 0; this.lastTarget = null;

    // computer playback
    this.demo = { on: false, paused: false, next: 0, offs: [], pos0: 0 };
  }

  beatMs() { return 60000 / this.bpm; }

  // ---------- loading ----------

  /** Rebuild notes/steps for the current hands + split. */
  build() {
    const sp = this.split, hands = this.hands;
    this.notes = this.src.notes
      .map(n => ({ ...n, h: sp === 'auto' ? n.h : (n.m >= +sp ? 'R' : 'L') }))
      .filter(n => hands === 'both' || (hands === 'right') === (n.h === 'R'))
      .sort((a, b) => a.t - b.t || a.m - b.m);
    this.steps = [];
    this.notes.forEach((n, i) => {
      const l = this.steps[this.steps.length - 1];
      if (l && n.t - l.t < 0.06) l.ns.push(i); else this.steps.push({ t: n.t, ns: [i] });
      n.step = this.steps.length - 1;
    });
    this.endT = this.notes.reduce((e, n) => Math.max(e, n.t + n.d), 0);
    // only explain the two hand colours when both hands are on screen
    this.h.legend(this.notes.some(n => n.h === 'R') && this.notes.some(n => n.h === 'L'));
  }

  /** Load a song and start from the beginning. */
  load(song) {
    this.killDemo();
    this.src = song;
    this.build();
    this.idx = 0;
    this.waitT = this.steps[0] ? this.steps[0].t : 0;
    this.countIn = false;
    this.progress.clear();
    this.total = this.correct = this.streak = this.hits = 0;
    this.results = [];
    this.running = false; this.done = false;
    this.scanFrom = 0;
    this.presses.clear();
    this.pos = this.mode === 'tempo' ? -2 : (this.steps[0] ? this.steps[0].t - 1 : 0);
    this.h.start('▶ Start');
    this.h.status(this.mode === 'wait' ? 'Play the highlighted notes.' : 'Press Start, then play each note as it reaches the line.');
    this.lastTarget = null;
    this.h.target(); this.h.stats(); this.h.changed();
  }

  restart() { this.load(this.src); }

  setMode(mode) { this.mode = mode; this.load(this.src); }

  /** Change tempo; a running song or demo keeps its place. */
  setBpm(v) {
    this.bpm = v;
    if (this.running || this.demo.on) this.t0 = this.now() - this.pos * this.beatMs();
  }

  /**
   * Switch hands (or the hand split) without losing your place or score.
   * Only restart() starts over.
   */
  changeHands() {
    if (!this.src) return;
    const d = this.demo, prevOffs = d.on ? d.offs : []; // Listen keeps playing; only the visible notes change
    // remember every scored note so switching back and forth loses nothing
    const key = n => n.t + ':' + n.m;
    this.notes.forEach((n, i) => {
      if (this.results[i] === 'hit' || this.results[i] === 'miss') this.progress.set(key(n), this.results[i]);
    });
    const pp = d.on ? d.pos0 : this.pos; // where you are practising (not where Listen is)
    const curT = this.mode === 'wait' ? this.waitT : pp;
    this.build();
    if (!this.notes.length) {
      this.hands = 'both';
      this.build();
      this.h.notice('That song has no notes for the selected hand.');
    }
    this.results = []; this.hits = 0; this.presses.clear();
    const passed = n => (this.mode === 'wait' ? n.t < curT - 0.001 : n.t + WIN < pp); // behind you: not scored
    this.notes.forEach((n, i) => {
      const r = this.progress.get(key(n));
      if (r) { this.results[i] = r; if (r === 'hit') this.hits++; } else if (passed(n)) this.results[i] = 'skip';
    });
    this.idx = this.steps.findIndex(s => s.t >= curT - 0.001);
    if (this.idx < 0) this.idx = this.steps.length;
    this.scanFrom = this.notes.findIndex(n => n.t + WIN >= pp);
    if (this.scanFrom < 0) this.scanFrom = this.notes.length;
    if (d.on) this.remapDemo(prevOffs);
    this.lastTarget = null;
    this.h.target(); this.h.stats(); this.h.changed();
  }

  // ---------- what to play next ----------

  /** Index of the step the player should play now, or null. */
  targetStep() {
    if (this.demo.on) return null;
    if (this.mode === 'wait') return this.idx < this.steps.length ? this.idx : null;
    for (let s = 0; s < this.steps.length; s++) {
      if (this.steps[s].t + WIN >= this.pos && this.steps[s].ns.some(i => this.results[i] == null)) return s;
    }
    return null;
  }

  stats() {
    return {
      hits: this.hits, count: this.notes.length, streak: this.streak,
      accuracy: this.total ? Math.round(100 * this.correct / this.total) + '%' : '–',
    };
  }

  fmtBeat(b) {
    const s = Math.round(b * 60 / this.bpm);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /** Progress (0..1) of each note being held, by note index. */
  holdProgress() {
    const m = new Map(), now = this.now();
    for (const p of this.presses.values()) for (const k of p.ks) m.set(k, clamp((now - p.start) / p.need, 0, 1));
    return m;
  }

  // ---------- playing ----------

  /**
   * A note was played. `src` is 'click' | 'qwerty' | 'midi' | 'mic'; `key` identifies the press
   * so release(key) can find it. Wait mode matches by note name, so any octave counts.
   */
  input(m, src, key) {
    if (this.demo.on) {
      if (!this.demo.paused) return;
      this.killDemo(); // playing while paused hands control back to you
    }
    const now = this.now(), pc = m % 12, mic = src === 'mic';
    if (this.mode === 'wait') {
      if (this.idx >= this.steps.length) return;
      if (mic && now - this.lastMatch < 300) return;
      this.total++;
      const i = this.steps[this.idx].ns.find(k => this.results[k] == null && this.notes[k].m % 12 === pc);
      if (i != null) { this.hit(i, m, mic, src, key); this.lastMatch = now; this.advance(); } else this.wrong(m);
    } else {
      if (!this.running) return;
      let best = -1;
      for (let i = this.scanFrom; i < this.notes.length && this.notes[i].t - WIN <= this.pos; i++) {
        if (this.results[i] == null && this.notes[i].m % 12 === pc &&
            (best < 0 || Math.abs(this.pos - this.notes[i].t) < Math.abs(this.pos - this.notes[best].t))) best = i;
      }
      this.total++;
      if (best >= 0) this.hit(best, m, mic, src, key); else this.wrong(m);
    }
    this.h.target(); this.h.stats();
  }

  wrong(m) {
    this.streak = 0;
    if (this.wrongFx) this.h.flash(m, 'wrong');
  }

  hit(i, m, mic, src, key) {
    // the mic hears one pitch at a time, so a mic hit credits every note of that chord
    const group = mic ? this.steps[this.notes[i].step].ns.filter(k => this.results[k] == null) : [i];
    if (this.mode === 'wait' && this.hold) {
      this.finishPress(key); // a new press on the same key completes the previous one
      const now = this.now();
      for (const k of group) this.results[k] = 'holding';
      this.presses.set(key, { ks: group, start: now, need: this.holdNeed(group, src), last: now, pc: m % 12 });
    } else {
      for (const k of group) { this.results[k] = 'hit'; this.hits++; }
    }
    this.correct++; this.streak++;
    this.h.flash(m, 'correct');
  }

  /** How long a note must be held: most of its written length, between 0.15 s and 4 s. */
  holdNeed(ks, src) {
    const d = Math.max(...ks.map(k => this.notes[k].d));
    return clamp(d * this.beatMs() * (src === 'mic' ? 0.5 : 0.7), 150, 4000);
  }

  finishPress(key) {
    const p = this.presses.get(key);
    if (!p) return;
    this.presses.delete(key);
    for (const k of p.ks) if (this.results[k] === 'holding') { this.results[k] = 'hit'; this.hits++; }
    this.advance();
  }

  /** Move to the next step once every note in the current one is done. */
  advance() {
    while (this.idx < this.steps.length && this.steps[this.idx].ns.every(k => this.results[k] === 'hit')) {
      this.idx++;
      if (this.idx >= this.steps.length) this.h.status('🎉 Song complete!');
    }
    if (this.steps[this.idx]) this.waitT = this.steps[this.idx].t;
  }

  /** A key was let go. Letting go of a note before its hold time means playing it again. */
  release(key) {
    const p = this.presses.get(key);
    if (!p) return;
    this.presses.delete(key);
    for (const k of p.ks) if (this.results[k] === 'holding') this.results[k] = null;
    this.streak = 0;
    this.h.status('Hold the note until its bar fills.');
    this.h.target(); this.h.stats();
  }

  /** The microphone still hears this pitch: keep the held mic note alive. */
  micHeld(midi) {
    const p = this.presses.get('mic');
    if (p && midi != null && midi % 12 === p.pc) p.last = this.now();
  }

  /** Play at tempo: start, pause or resume. */
  toggleRun() {
    if (this.running) { this.running = false; this.h.start('▶ Resume'); return; }
    if (this.done) this.load(this.src);
    if (this.countIn) { this.pos -= 2; this.countIn = false; }
    this.t0 = this.now() - this.pos * this.beatMs();
    this.running = true;
    this.h.start('⏸ Pause');
    this.h.status('Play each note as it reaches the line.');
  }

  // ---------- per-frame update ----------

  tick() {
    if (this.demo.on) this.demoTick();
    else if (this.mode === 'wait') {
      const tgt = this.steps[this.idx] ? this.steps[this.idx].t : (this.notes.length ? this.notes[this.notes.length - 1].t + 1 : 0);
      this.pos += (tgt - this.pos) * 0.15;
    } else this.tempoTick();
    this.holdTick();
    const tg = this.targetStep();
    if (tg !== this.lastTarget) { this.lastTarget = tg; this.h.target(); }
  }

  tempoTick() {
    if (!this.running) return;
    this.pos = (this.now() - this.t0) / this.beatMs();
    while (this.scanFrom < this.notes.length && this.notes[this.scanFrom].t + WIN < this.pos) {
      if (this.results[this.scanFrom] == null) { this.results[this.scanFrom] = 'miss'; this.streak = 0; this.total++; this.h.stats(); }
      this.scanFrom++;
    }
    if (this.scanFrom >= this.notes.length && this.pos > this.notes[this.notes.length - 1].t + 1) {
      this.running = false; this.done = true;
      this.h.start('▶ Play again');
      this.h.status(`Finished: ${this.hits} of ${this.notes.length} notes played on time, ${this.notes.length - this.hits} missed.`);
    }
  }

  holdTick() {
    if (!this.presses.size) return;
    const now = this.now();
    for (const [key, p] of [...this.presses]) {
      if (key === 'mic' && now - p.last > 250) this.release(key); // mic stopped hearing the note
      else if (now - p.start >= p.need) { this.finishPress(key); this.h.target(); this.h.stats(); }
    }
  }

  // ---------- jumping around ----------

  curBeat() { return this.mode === 'wait' ? this.waitT : Math.max(this.pos, 0); }

  /** Start from beat t. Notes before it are greyed out and not scored. */
  seekTo(t) {
    if (!this.notes.length) return;
    t = clamp(t, 0, this.endT);
    const d = this.demo;
    if (d.on) { // move the computer's playback instead
      if (!d.paused) for (const o of d.offs) { this.h.voiceOff(o.key); this.h.demoKey(o.note, false); }
      d.offs = [];
      d.next = this.notes.findIndex(n => n.t >= t - 0.001);
      if (d.next < 0) d.next = this.notes.length;
      this.pos = t; this.t0 = this.now() - this.pos * this.beatMs();
      return;
    }
    this.presses.clear(); this.progress.clear();
    this.results = []; this.hits = 0; this.total = this.correct = this.streak = 0;
    this.notes.forEach((n, i) => { if (n.t < t - 0.001) this.results[i] = 'skip'; });
    this.idx = this.steps.findIndex(s => s.t >= t - 0.001);
    if (this.idx < 0) this.idx = this.steps.length;
    this.waitT = this.steps[this.idx] ? this.steps[this.idx].t : t;
    if (this.mode === 'tempo') {
      this.pos = t;
      if (!this.running) this.countIn = true; // Start adds a two-beat count-in before this point
      this.done = false;
      this.scanFrom = this.notes.findIndex(n => n.t + WIN >= this.pos);
      if (this.scanFrom < 0) this.scanFrom = this.notes.length;
      if (this.running) this.t0 = this.now() - this.pos * this.beatMs();
    }
    this.lastTarget = null;
    this.h.target(); this.h.stats();
    this.h.status('Starting from ' + this.fmtBeat(t) + '.');
  }

  /** Move by whole steps (single notes or chords). */
  stepBy(delta) {
    let cur = this.steps.findIndex(s => s.t >= this.curBeat() - 0.001);
    if (cur < 0) cur = this.steps.length;
    const to = clamp(cur + delta, 0, this.steps.length - 1);
    if (this.steps[to]) this.seekTo(this.steps[to].t);
  }

  // ---------- listen: the computer plays the song perfectly ----------

  /** Play from where you are (or from the top if finished). Your progress is left untouched. */
  startDemo() {
    const d = this.demo;
    if (!this.notes.length) return;
    if (this.running) { this.running = false; this.h.start('▶ Resume'); }
    d.pos0 = this.pos;
    let from = this.mode === 'wait' ? (this.steps[this.idx] ? this.steps[this.idx].t : 0) : Math.max(this.pos, 0);
    d.next = this.notes.findIndex(n => n.t >= from - 0.001);
    if (d.next < 0) { d.next = 0; from = 0; }
    d.on = true; d.paused = false; d.offs = [];
    this.pos = from - 1;
    this.t0 = this.now() - this.pos * this.beatMs();
    this.h.listen('⏸ Pause', true);
    this.h.status('Listening… the computer plays the song (hands and tempo follow your settings).');
  }

  pauseDemo() {
    const d = this.demo;
    d.paused = true;
    for (const o of d.offs) { this.h.voiceOff(o.key); this.h.demoKey(o.note, false); }
    this.h.listen('▶ Resume', true);
    this.h.status('Paused. Press Resume to keep listening, or play a note to go back to practice.');
  }

  resumeDemo() {
    const d = this.demo;
    for (const o of d.offs) { this.h.voiceOn(o.note.m, o.key); this.h.demoKey(o.note, true); }
    this.t0 = this.now() - this.pos * this.beatMs();
    d.paused = false;
    this.h.listen('⏸ Pause', true);
    this.h.status('Listening…');
  }

  toggleDemo() {
    if (!this.demo.on) this.startDemo();
    else if (this.demo.paused) this.resumeDemo();
    else this.pauseDemo();
  }

  /** Sound a note now and remember to release it when it ends. */
  startDemoNote(n, silent = false) {
    const key = 'd' + n.t + ':' + n.m; // stable, so it survives the note list being rebuilt
    if (!silent) { this.h.voiceOn(n.m, key); this.h.demoKey(n, true); }
    this.demo.offs.push({ at: n.t + n.d, key, note: n });
  }

  /**
   * The visible notes changed (hands or split) while Listen is playing. Notes that stay keep
   * sounding without a break, hidden ones are cut, and newly shown ones that should already be
   * sounding start now, so the music carries on seamlessly.
   */
  remapDemo(prevOffs) {
    const d = this.demo, byId = new Map(this.notes.map(n => [n.t + ':' + n.m, n]));
    d.offs = [];
    for (const o of prevOffs) {
      const nn = byId.get(o.note.t + ':' + o.note.m);
      if (nn && nn.h === o.note.h) d.offs.push({ at: o.at, key: o.key, note: nn });
      else if (!d.paused) { this.h.voiceOff(o.key); this.h.demoKey(o.note, false); }
    }
    d.next = this.notes.findIndex(n => n.t > this.pos);
    if (d.next < 0) d.next = this.notes.length;
    for (const n of this.notes) {
      if (n.t <= this.pos && n.t + n.d > this.pos && !d.offs.some(o => o.note === n)) this.startDemoNote(n, d.paused);
    }
  }

  demoTick() {
    const d = this.demo;
    if (d.paused) return;
    this.pos = (this.now() - this.t0) / this.beatMs();
    while (d.next < this.notes.length && this.notes[d.next].t <= this.pos) {
      const n = this.notes[d.next];
      this.startDemoNote(n);
      d.next++;
    }
    d.offs = d.offs.filter(o => {
      if (o.at > this.pos) return true;
      this.h.voiceOff(o.key); this.h.demoKey(o.note, false);
      return false;
    });
    if (d.next >= this.notes.length && !d.offs.length) { this.killDemo(); this.h.status('Demo finished. Your turn!'); }
  }

  /** Stop the computer playback and return to your own place. */
  killDemo() {
    const d = this.demo;
    if (!d.on) return;
    d.on = false;
    if (!d.paused) for (const o of d.offs) { this.h.voiceOff(o.key); this.h.demoKey(o.note, false); }
    d.paused = false; d.offs = [];
    this.pos = d.pos0;
    this.h.listen('🔊 Listen', false);
    this.h.status('Back to practice — your place was kept.');
  }
}
