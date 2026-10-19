// The falling-note roll, drawn on a canvas. Reads the engine, never changes it.
import { clamp, NAMES, fit } from './util.js';
import { columns } from './keyboard.js';

const PX = 90; // pixels per beat

export class Roll {
  constructor(canvas, engine, getRange) {
    this.cv = canvas;
    this.cx = canvas.getContext('2d');
    this.engine = engine;
    this.getRange = getRange;
    // also fires when the settings panel or layout changes the size
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
  }

  resize() {
    const r = this.cv.getBoundingClientRect(), d = devicePixelRatio || 1;
    this.cv.width = r.width * d;
    this.cv.height = r.height * d;
    this.cx.setTransform(d, 0, 0, d, 0, 0);
  }

  draw(ts) {
    const { cv, cx, engine: e } = this;
    const range = this.getRange();
    const w = cv.clientWidth, h = cv.clientHeight, base = h - 30; // hit line sits above the seek bar
    cx.clearRect(0, 0, w, h);
    const pos = e.pos, frac = e.holdProgress(), tg = e.targetStep();

    cx.strokeStyle = '#22d3ee55';
    cx.lineWidth = 2;
    cx.beginPath(); cx.moveTo(0, base); cx.lineTo(w, base); cx.stroke();

    const { xs, ww } = columns(range, w), pw = Math.max(ww * 0.9, 14);
    for (let i = 0; i < e.notes.length; i++) {
      const n = e.notes[i], y = base - (n.t - pos) * PX;
      if (y < 0) break; // notes are sorted by time; the rest are above the screen
      const ph = clamp(n.d * PX - 4, 14, PX * 4);
      if (y - ph > h) continue;
      const x = xs[fit(n.m, range)];
      if (x == null) continue;
      const res = e.results[i], active = tg != null && n.step === tg && res == null;
      // hit and skipped notes fade out once the line has passed them
      cx.globalAlpha = res === 'hit' || res === 'skip' ? clamp(1 - (pos - n.t - 0.25) * 2, 0, 1) : 1;
      if (cx.globalAlpha <= 0) continue;
      const playing = e.demo.on && n.t <= pos && pos < n.t + n.d;
      const col = res === 'hit' ? '#34d399' : res === 'skip' ? '#6b7280' : res === 'miss' ? '#f87171'
        : res === 'holding' ? '#f59e0b' : n.h === 'L' ? '#a78bfa' : '#22d3ee';
      cx.beginPath(); cx.roundRect(x - pw / 2, y - ph, pw, ph, 8);
      cx.fillStyle = col + (res ? '44' : active || playing ? '77' : '22');
      cx.fill();
      if (res === 'holding') { // hold progress fills the bar from the bottom
        cx.save(); cx.clip();
        cx.fillStyle = col + '99';
        const fh = ph * frac.get(i);
        cx.fillRect(x - pw / 2, y - fh, pw, fh);
        cx.restore();
        cx.beginPath(); cx.roundRect(x - pw / 2, y - ph, pw, ph, 8);
      }
      cx.strokeStyle = col;
      cx.lineWidth = active || playing ? 3 : 1.5;
      if (active || playing) { cx.shadowColor = col; cx.shadowBlur = 14 + 6 * Math.sin(ts / 200); }
      cx.stroke();
      cx.shadowBlur = 0;
      if (pw > 20 && ph >= 18) {
        cx.fillStyle = '#e6edf3'; cx.font = '11px system-ui'; cx.textAlign = 'center';
        cx.fillText(NAMES[n.m % 12], x, y - ph / 2 + 4);
      }
    }
    cx.globalAlpha = 1;
    if (e.mode === 'tempo' && e.running && pos < 0) { // count-in
      cx.fillStyle = '#e6edf3'; cx.font = 'bold 64px system-ui'; cx.textAlign = 'center';
      cx.fillText(Math.ceil(-pos), w / 2, h / 2);
    }
  }
}
