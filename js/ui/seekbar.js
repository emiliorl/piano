import { $ } from '../dom.js';
import { clamp } from '../util.js';

/** The jump-to slider, mouse-wheel scrolling over the roll, and the time read-out. */
export function setupSeekbar(engine, canvas) {
  const slider = $('seek');
  let seeking = false, wheelAcc = 0;

  slider.addEventListener('pointerdown', () => { seeking = true; });
  addEventListener('pointerup', () => { seeking = false; });
  slider.addEventListener('input', () => engine.seekTo(+slider.value));

  // one note or chord per ~80 px of wheel movement
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    wheelAcc += e.deltaY;
    while (Math.abs(wheelAcc) >= 80) {
      engine.stepBy(wheelAcc > 0 ? 1 : -1);
      wheelAcc -= Math.sign(wheelAcc) * 80;
    }
  }, { passive: false });

  return function update() {
    if (+slider.max !== engine.endT) slider.max = engine.endT;
    const cur = clamp(engine.pos, 0, engine.endT);
    if (!seeking) slider.value = cur;
    const txt = engine.fmtBeat(cur) + ' / ' + engine.fmtBeat(engine.endT);
    if ($('seekl').textContent !== txt) $('seekl').textContent = txt;
  };
}
