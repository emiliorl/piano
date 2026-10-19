// Small pure helpers shared by every module (no DOM, no audio).

export const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const isBlack = m => [1, 3, 6, 8, 10].includes(m % 12);
export const noteName = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);
export const hz = m => 440 * 2 ** ((m - 69) / 12);

/** "C#4" -> 61, or null if it is not a note name. */
export function parseNote(s) {
  const r = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(s);
  if (!r) return null;
  let p = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[r[1].toUpperCase()];
  if (r[2] === '#') p++;
  if (r[2] === 'b') p--;
  return (+r[3] + 1) * 12 + p;
}

/** Move a note by octaves until it falls inside [range[0], range[1]]. */
export function fit(m, range) {
  while (m < range[0]) m += 12;
  while (m > range[1]) m -= 12;
  return m;
}
