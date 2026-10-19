// Physical inputs: mouse/touch on the keys, the computer keyboard and a MIDI keyboard.
// Each one reports presses and releases; what a press means is decided by the caller.

// Two-row layout like a music-software keyboard: bottom row = one octave from C,
// top row = the next octave and a bit. Values are semitones above C of the base octave.
export const QMAP = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  q: 12, '2': 13, w: 14, '3': 15, e: 16, r: 17, '5': 18, t: 19, '6': 20, y: 21, '7': 22, u: 23,
  i: 24, '9': 25, o: 26, '0': 27, p: 28,
};

/**
 * handlers: { press(m, src, key), release(key), octave(delta), step(delta), base() }
 * `keyboard` is the PianoKeyboard (for mouse presses).
 */
export function bindInputs({ keyboard, press, release, octave, step, base }) {
  // mouse / touch on the on-screen keys
  const pointers = new Set();
  keyboard.onPress = (m, id) => { pointers.add(id); press(m, 'click', 'p' + id); };
  const up = e => { if (pointers.delete(e.pointerId)) release('p' + e.pointerId); };
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);

  // computer keyboard
  const down = {};
  addEventListener('keydown', e => {
    if (e.repeat || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'arrowright' || k === '[' || k === ']') {
      octave(k === 'arrowleft' || k === '[' ? -1 : 1);
      e.preventDefault();
      return;
    }
    if (k === 'arrowup' || k === 'arrowdown' || k === 'pageup' || k === 'pagedown') {
      step((k === 'arrowdown' || k === 'pagedown' ? 1 : -1) * (k.startsWith('page') ? 8 : 1));
      e.preventDefault();
      return;
    }
    if (k in QMAP) {
      const m = (base() + 1) * 12 + QMAP[k];
      down[k] = m; // remember the note so a later octave change does not strand it
      press(m, 'qwerty', 'q' + m);
    }
  });
  addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k in down) { release('q' + down[k]); delete down[k]; }
  });

  // MIDI keyboard (Chromium)
  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(access => {
      const hook = input => {
        input.onmidimessage = e => {
          const [s, n, v] = e.data, hi = s & 0xf0;
          if (hi === 0x90 && v > 0) press(n, 'midi', 'm' + n);
          else if (hi === 0x80 || hi === 0x90) release('m' + n);
        };
      };
      access.inputs.forEach(hook);
      access.onstatechange = () => access.inputs.forEach(hook);
    }).catch(() => {});
  }
}
