// Shared test helpers.

const vlq = n => {
  const b = [n & 127];
  while ((n >>= 7)) b.unshift((n & 127) | 128);
  return b;
};

/** A track playing `pitches` one after another, `step` ticks apart, each held for `len` ticks. */
export function track(pitches, step, len, extra = []) {
  const b = [...extra];
  // each event starts with the time since the previous event: the gap after the last note-off
  pitches.forEach((p, i) => b.push(...vlq(i ? step - len : 0), 0x90, p, 80, ...vlq(len), 0x80, p, 0));
  b.push(0, 0xff, 0x2f, 0);
  return b;
}

const chunk = (id, bytes) => [...id, (bytes.length >>> 24) & 255, (bytes.length >>> 16) & 255, (bytes.length >>> 8) & 255, bytes.length & 255, ...bytes];

/** A format-1 MIDI file as an ArrayBuffer, 480 ticks per beat. */
export function midiFile(tracks, ppq = 480) {
  const head = chunk([0x4d, 0x54, 0x68, 0x64], [0, 1, 0, tracks.length, (ppq >> 8) & 255, ppq & 255]);
  const body = tracks.flatMap(t => chunk([0x4d, 0x54, 0x72, 0x6b], t));
  return new Uint8Array([...head, ...body]).buffer;
}

/** A tempo meta event (microseconds per beat) to put at the start of a track. */
export const tempoEvent = bpm => {
  const us = Math.round(60000000 / bpm);
  return [0, 0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255];
};

/** A song source from a list of [beat, midi, hand] (each a one-beat note). */
export function song(list, name = 'test') {
  return { name, bpm: 70, notes: list.map(([t, m, h = 'R']) => ({ t, d: 0.9, m, h })) };
}
