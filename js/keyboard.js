// The on-screen piano keyboard (DOM) and the key-column geometry the falling-note roll shares with it.
import { isBlack, noteName, fit } from './util.js';

/** x position (px) of each key's column across width w; black keys sit on the seam between whites. */
export function columns(range, w) {
  const [lo, hi] = range;
  let whites = 0, wi = 0;
  const xs = {};
  for (let k = lo; k <= hi; k++) if (!isBlack(k)) whites++;
  const ww = w / whites;
  for (let k = lo; k <= hi; k++) {
    if (!isBlack(k)) { xs[k] = wi * ww + ww / 2; wi++; } else xs[k] = wi * ww;
  }
  return { xs, ww };
}

export class PianoKeyboard {
  constructor(el) {
    this.el = el;
    this.keys = {}; // midi -> element
    this.range = [36, 84];
    this.heardEl = null;
    this.demoCount = {};
    el.addEventListener('pointerdown', e => {
      const m = e.target.dataset?.m;
      if (m != null) this.onPress?.(+m, e.pointerId);
    });
  }

  /** Called with (midi, pointerId) when a key is pressed with the mouse or touch. */
  onPress = null;

  build(range) {
    this.range = range;
    this.el.innerHTML = '';
    this.keys = {};
    this.heardEl = null;
    const [lo, hi] = range;
    let whites = 0, wi = 0;
    for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites++;
    const ww = 100 / whites, bw = ww * 0.6;
    for (let m = lo; m <= hi; m++) {
      const el = document.createElement('div');
      if (!isBlack(m)) {
        el.className = 'w';
        el.style.left = wi * ww + '%';
        el.style.width = ww + '%';
        if (m % 12 === 0) {
          const l = document.createElement('div');
          l.className = 'lbl';
          l.textContent = noteName(m);
          el.appendChild(l);
        }
        wi++;
      } else {
        el.className = 'b';
        el.style.left = wi * ww - bw / 2 + '%';
        el.style.width = bw + '%';
      }
      el.dataset.m = m;
      this.keys[m] = el;
      this.el.appendChild(el);
    }
  }

  fit(m) { return fit(m, this.range); }

  /** Show computer-key letters on the keys. `entries` is [{m, label}]. */
  setLabels(entries) {
    for (const m in this.keys) this.keys[m].querySelector('.qk')?.remove();
    for (const { m, label } of entries) {
      const el = this.keys[m];
      if (!el) continue;
      const d = document.createElement('div');
      d.className = 'qk';
      d.textContent = label;
      el.appendChild(d);
    }
  }

  /** Highlight the keys to play next. `list` is [{m, h}] with h 'R' or 'L'. */
  setTargets(list) {
    for (const m in this.keys) this.keys[m].classList.remove('target', 'targetL');
    for (const { m, h } of list) this.keys[m]?.classList.add(h === 'L' ? 'targetL' : 'target');
  }

  /** Brief green/red feedback. kind: 'correct' | 'wrong'. */
  flash(m, kind) {
    const el = this.keys[m], cls = 'key-detected-' + kind;
    if (!el) return;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 250);
  }

  /** Show a key as physically pressed. */
  setDown(m, on) { this.keys[m]?.classList.toggle('down', on); }

  /** Mark the key the microphone currently hears. */
  setHeard(m) {
    const el = m != null ? this.keys[m] || null : null;
    if (el === this.heardEl) return;
    this.heardEl?.classList.remove('heard');
    el?.classList.add('heard');
    this.heardEl = el;
  }

  /** Light a key while the computer plays it (counts overlapping notes on one key). */
  demoKey(note, on) {
    const k = this.fit(note.m), id = k + note.h;
    this.demoCount[id] = (this.demoCount[id] || 0) + (on ? 1 : -1);
    this.keys[k]?.classList.toggle(note.h === 'L' ? 'targetL' : 'target', this.demoCount[id] > 0);
  }
}
