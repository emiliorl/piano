import { $ } from '../dom.js';

/**
 * Turn <select> elements into small button groups. The hidden select stays the source of truth:
 * clicking a button sets it and fires a normal "change" event. Returns a sync() to call after
 * the select's value is changed from code.
 */
export function makeSegments(defs) {
  const segs = Object.entries(defs).map(([id, labels]) => {
    const sel = $(id), wrap = document.createElement('div');
    wrap.className = 'seg';
    sel.style.display = 'none';
    [...sel.options].forEach((o, i) => {
      const b = document.createElement('button');
      b.textContent = labels[i];
      b.title = o.text;
      b.dataset.v = o.value;
      b.onclick = () => { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); };
      wrap.appendChild(b);
    });
    sel.after(wrap);
    return [sel, wrap];
  });
  const sync = () => segs.forEach(([sel, w]) => [...w.children].forEach(b => b.classList.toggle('on', b.dataset.v === sel.value)));
  setInterval(sync, 150);
  sync();
  return sync;
}
