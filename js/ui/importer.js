import { $ } from '../dom.js';
import { parseMidi } from '../songs/midi.js';
import { textSong } from '../songs/text.js';
import { b64 } from '../songs/library.js';

/**
 * The Import dialog, drag-and-drop of .mid files, and deleting imported songs.
 * onAdded(value) is called with the dropdown value of the new song; onDeleted() after a delete.
 */
export function setupImporter({ library, status, onAdded, onDeleted }) {
  const dlg = $('dlg');

  function add(custom, song) {
    const saved = library.add(custom);
    if (!saved) status('Song loaded, but it was too large to save in this browser.');
    onAdded('c:' + (library.customs.length - 1), song);
  }

  async function importFile(f) {
    try {
      const buf = await f.arrayBuffer(), name = f.name.replace(/\.midi?$/i, '');
      const song = parseMidi(buf, name);
      add({ name, kind: 'midi', data: b64(buf) }, song);
      dlg.close?.();
      status(`Loaded "${name}": ${song.notes.length} notes. Use the hands selector to practise one hand at a time.`);
    } catch (err) {
      alert('Could not read that file: ' + err.message);
    }
  }

  $('import').onclick = () => dlg.showModal();
  $('cancel').onclick = () => dlg.close();
  $('file').onchange = e => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; };

  $('load').onclick = () => {
    const text = $('txt').value.trim();
    if (!text) return;
    const name = $('sname').value.trim() || 'Custom ' + (library.customs.length + 1);
    try {
      add({ name, kind: 'text', data: text }, textSong(name, text));
      dlg.close();
      $('txt').value = $('sname').value = '';
    } catch (err) { alert(err.message); }
  };

  $('del').onclick = () => {
    const v = $('song').value;
    if (!v.startsWith('c:')) return alert('Select one of your imported songs (★) first.');
    library.remove(+v.slice(2));
    dlg.close();
    onDeleted();
  };

  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', e => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && /\.midi?$/i.test(f.name)) importFile(f);
  });
}
