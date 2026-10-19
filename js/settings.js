// Remembers settings, the last song, and (optionally) settings for each song, in localStorage.
import { $ } from './dom.js';

// Controls whose value is saved for the whole app. Hands, split, tempo and mode are also
// saved per song when the "remember per song" option is on.
const GLOBAL_IDS = ['range', 'thr', 'sound', 'inst', 'vol', 'reverb', 'hold', 'hl', 'wrongfx', 'autooct', 'mode', 'hands', 'split', 'persong'];
const KEY = 'piano.settings';

const val = id => { const e = $(id); return e.type === 'checkbox' ? e.checked : e.value; };

export class Settings {
  /**
   * library: for song keys. showKeys: {get(), set(on)} for the key-label toggle.
   */
  constructor(library, showKeys, storage = localStorage) {
    this.library = library;
    this.showKeys = showKeys;
    this.storage = storage;
    this.data = { g: {}, songs: {}, song: null };
    try { Object.assign(this.data, JSON.parse(storage.getItem(KEY) || '{}')); } catch (e) { /* start fresh */ }
    this.timer = null;
  }

  /** Settings saved for a song, or undefined. */
  forSong(key) { return this.data.songs[key]; }
  get lastSong() { return this.data.song; }

  /** Push saved values into the controls. */
  apply() {
    const g = this.data.g || {};
    for (const id of GLOBAL_IDS) {
      if (!(id in g)) continue;
      const e = $(id);
      if (e.type === 'checkbox') e.checked = g[id];
      else if (!e.options || [...e.options].some(o => o.value === String(g[id]))) e.value = g[id];
    }
    this.showKeys.set(g.showKeys !== false);
    $('thrv').textContent = $('thr').value;
  }

  /** Save soon (batches rapid changes like dragging a slider). */
  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const g = {};
      GLOBAL_IDS.forEach(id => (g[id] = val(id)));
      g.showKeys = this.showKeys.get();
      this.data.g = g;
      this.data.song = this.library.keyOf($('song').value);
      if (g.persong && this.data.song) {
        this.data.songs[this.data.song] = { hands: g.hands, split: g.split, bpm: +$('bpm').value, mode: g.mode };
      }
      try { this.storage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* storage full or blocked */ }
    }, 200);
  }

  reset() { this.storage.removeItem(KEY); }
}
