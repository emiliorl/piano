import { textSong } from './text.js';
import { parseMidi } from './midi.js';
import { BUILTIN, BPMS } from './builtin.js';

export function b64(buf) {
  let s = '';
  const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192));
  return btoa(s);
}

export function unb64(s) {
  const b = atob(s), u = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
  return u.buffer;
}

/**
 * The built-in songs plus the user's imported ones (kept in `storage`, normally localStorage).
 * A song is referred to by a "value" ('b:Name' or 'c:index') for the dropdown, and by a
 * stable "key" ('b:Name' or 'c:Name') for remembering settings, since indexes shift on delete.
 */
export class Library {
  constructor(storage = globalThis.localStorage, storeKey = 'piano.custom') {
    this.storage = storage;
    this.storeKey = storeKey;
    this.customs = [];
    try { this.customs = JSON.parse(storage.getItem(storeKey) || '[]'); } catch (e) { /* start empty */ }
  }

  /** Returns false if the browser refused to store it (too big, private mode). */
  save() {
    try { this.storage.setItem(this.storeKey, JSON.stringify(this.customs)); return true; } catch (e) { return false; }
  }

  add(custom) { this.customs.push(custom); return this.save(); }
  remove(index) { this.customs.splice(index, 1); this.save(); }

  options() {
    return [
      ...Object.keys(BUILTIN).map(n => ({ value: 'b:' + n, label: n })),
      ...this.customs.map((c, i) => ({ value: 'c:' + i, label: '★ ' + c.name })),
    ];
  }

  source(value) {
    if (value.startsWith('b:')) {
      const n = value.slice(2);
      return textSong(n, BUILTIN[n], BPMS[n] || 70);
    }
    const c = this.customs[+value.slice(2)];
    return c.kind === 'midi' ? parseMidi(unb64(c.data), c.name) : textSong(c.name, c.data);
  }

  keyOf(value) {
    return value.startsWith('c:') ? 'c:' + this.customs[+value.slice(2)]?.name : value;
  }

  valueOf(key) {
    if (!key) return null;
    if (key.startsWith('c:')) {
      const i = this.customs.findIndex(c => c.name === key.slice(2));
      return i < 0 ? null : 'c:' + i;
    }
    return key.slice(2) in BUILTIN ? key : null;
  }
}
