import { parseNote } from '../util.js';

/**
 * A song source is {name, bpm, notes:[{t, d, m, h}]}:
 * start time t and length d in beats, MIDI pitch m, hand h ('R' or 'L').
 * Shifts the song so the first note starts at beat 0.
 */
export function mkSong(name, bpm, notes) {
  if (!notes.length) throw new Error('No notes found');
  const s = Math.min(...notes.map(n => n.t));
  notes.forEach(n => (n.t -= s));
  return { name, bpm, notes };
}

/**
 * Parse typed notes. Each space-separated token is a note or a chord joined with "+";
 * "_" is a rest; ":n" after a note sets its length in beats (default 1).
 * The song moves on by the length of the token's first note.
 */
export function textSong(name, text, bpm = 70) {
  const notes = [];
  let t = 0;
  for (const tok of text.trim().split(/\s+/)) {
    let adv = 1;
    tok.split('+').forEach((part, k) => {
      const [nm, len] = part.split(':');
      const dur = len ? +len : 1;
      if (k === 0) adv = dur;
      const m = parseNote(nm);
      if (m != null) notes.push({ t, d: Math.max(0.2, dur - 0.1), m, h: m >= 60 ? 'R' : 'L' });
    });
    t += adv;
  }
  return mkSong(name, bpm, notes);
}
