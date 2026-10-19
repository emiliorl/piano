import { mkSong } from './text.js';

/**
 * Read a standard MIDI file (ArrayBuffer) into a song source.
 * Keeps note timing, lengths and the first tempo; skips the drum channel.
 * Hands: exactly two clearly separate tracks = right (higher) and left; otherwise split at middle C.
 */
export function parseMidi(buf, name) {
  const d = new DataView(buf);
  let p = 0;
  const str = n => {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(p++));
    return s;
  };
  const vlq = () => {
    let v = 0, b;
    do { b = d.getUint8(p++); v = (v << 7) | (b & 127); } while (b & 128);
    return v;
  };
  if (str(4) !== 'MThd') throw new Error('Not a MIDI file');
  const hl = d.getUint32(p);
  const ntr = d.getUint16(p + 6), div = d.getUint16(p + 8);
  p += 4 + hl;
  if (div & 0x8000) throw new Error('SMPTE timing is not supported');

  let bpm = null;
  const tracks = [];
  for (let t = 0; t < ntr && p < d.byteLength; t++) {
    if (str(4) !== 'MTrk') break;
    const end = p + 4 + d.getUint32(p);
    p += 4;
    let tick = 0, run = 0;
    const on = {}, ns = [];
    while (p < end) {
      tick += vlq();
      let s = d.getUint8(p);
      if (s === 0xFF) { // meta event
        p++;
        const type = d.getUint8(p++), l = vlq();
        if (type === 0x51 && bpm == null) bpm = 60000000 / ((d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2));
        p += l;
        continue;
      }
      if (s === 0xF0 || s === 0xF7) { p++; p += vlq(); continue; } // sysex
      if (s & 0x80) { run = s; p++; } else s = run; // running status
      const hi = s & 0xF0, ch = s & 15;
      if (hi === 0xC0 || hi === 0xD0) { p++; continue; } // one data byte
      const a = d.getUint8(p++), c = d.getUint8(p++), key = ch * 128 + a;
      if (hi === 0x90 && c > 0) on[key] = tick;
      else if ((hi === 0x80 || hi === 0x90) && on[key] != null) {
        if (ch !== 9) ns.push({ t: on[key] / div, d: Math.max(0.1, (tick - on[key]) / div), m: a });
        delete on[key];
      }
    }
    p = end;
    if (ns.length) tracks.push(ns);
  }

  const all = tracks.flat();
  const avg = tracks.map(t => t.reduce((s, n) => s + n.m, 0) / t.length);
  if (tracks.length === 2 && Math.abs(avg[0] - avg[1]) >= 6) {
    const r = avg[0] > avg[1] ? 0 : 1;
    tracks.forEach((t, i) => t.forEach(n => (n.h = i === r ? 'R' : 'L')));
  } else all.forEach(n => (n.h = n.m >= 60 ? 'R' : 'L'));
  return mkSong(name, bpm ? Math.round(bpm) : 70, all);
}
