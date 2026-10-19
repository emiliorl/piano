// Keyfall entry point: creates the pieces and connects them to the page.
//
//   engine.js     practice logic (no DOM)         audio.js     sounds
//   keyboard.js   on-screen piano                  roll.js      falling-note canvas
//   inputs.js     mouse / keys / MIDI              mic.js       microphone + pitch.js
//   songs/*       built-in songs, MIDI + text      settings.js  remembered settings
//   ui/*          segmented buttons, seek bar, import dialog
import { $ } from './dom.js';
import { clamp, noteName } from './util.js';
import { Practice } from './engine.js';
import { Library } from './songs/library.js';
import { Settings } from './settings.js';
import { PianoKeyboard } from './keyboard.js';
import { Roll } from './roll.js';
import { QMAP, bindInputs } from './inputs.js';
import { createMic } from './mic.js';
import * as sound from './audio.js';
import { makeSegments } from './ui/segments.js';
import { setupSeekbar } from './ui/seekbar.js';
import { setupImporter } from './ui/importer.js';

const BUILD = '2026-10-18 · modules';

const library = new Library();
const keyboard = new PianoKeyboard($('kb'));
let range = [36, 84]; // visible keyboard range
let base = 4; // octave the computer-key letters start from (C4)
let showKeys = true;
const instrument = () => $('inst').value;
const status = t => { $('status').textContent = t; };

// ---------- engine and what it can ask of the page ----------
const engine = new Practice({
  status,
  stats() {
    const s = engine.stats();
    $('pos').textContent = s.hits + '/' + s.count;
    $('streak').textContent = s.streak;
    $('acc').textContent = s.accuracy;
  },
  target: markTarget,
  start: t => { $('start').textContent = t; },
  listen: (t, on) => { $('listen').textContent = t; $('listen').classList.toggle('on', on); },
  flash: (m, kind) => keyboard.flash(m, kind),
  voiceOn: (m, key) => sound.noteOn(m, key, instrument()), // the computer's own playback ignores the sound switch
  voiceOff: key => sound.noteOff(key),
  demoKey: (n, on) => keyboard.demoKey(n, on),
  legend: show => { $('legend').style.display = show ? '' : 'none'; },
  changed: () => settings.save(),
  notice: msg => alert(msg),
});

const settings = new Settings(library, {
  get: () => showKeys,
  set: v => { showKeys = v; $('keys').classList.toggle('on', v); },
});

// ---------- keyboard highlights and computer-key labels ----------
function updateLabels() {
  keyboard.setLabels(showKeys ? Object.entries(QMAP).map(([k, off]) => ({ m: (base + 1) * 12 + off, label: k.toUpperCase() })) : []);
}
function setBase(b) {
  b = clamp(b, 0, 7);
  if (b === base) return;
  base = b;
  $('oct').textContent = base;
  updateLabels();
}
function markTarget() {
  if (engine.demo.on) return; // while the computer plays, the keys show what it plays
  const s = engine.targetStep();
  const notes = s == null ? [] : engine.steps[s].ns.map(i => engine.notes[i]);
  // slide the computer-key letters under the notes that are coming up
  if (s != null && $('autooct').checked) setBase(Math.floor(Math.min(...notes.map(n => n.m)) / 12) - 1);
  const todo = s != null && $('hl').checked ? engine.steps[s].ns.filter(i => engine.results[i] == null) : [];
  keyboard.setTargets(todo.map(i => ({ m: keyboard.fit(engine.notes[i].m), h: engine.notes[i].h })));
}

// ---------- pressing keys ----------
const down = new Map(); // key id -> midi note, to show keys as pressed
function press(m, src, key) {
  down.set(key, m);
  keyboard.setDown(m, true);
  if ((src === 'click' || src === 'qwerty') && $('sound').checked) sound.noteOn(m, key, instrument()); // MIDI/mic: the real instrument makes the sound
  engine.input(m, src, key);
}
function release(key) {
  sound.noteOff(key);
  const m = down.get(key);
  if (m != null) {
    down.delete(key);
    if (![...down.values()].includes(m)) keyboard.setDown(m, false);
  }
  engine.release(key);
}
bindInputs({
  keyboard, press, release, base: () => base,
  octave: d => { $('autooct').checked = false; setBase(base + d); }, // moving the keys by hand turns off auto-follow
  step: d => engine.stepBy(d),
});

// ---------- microphone ----------
function showHeard(r) {
  $('heard').style.display = 'block';
  const ok = r.midi != null && r.midi >= 21 && r.midi <= 108;
  $('hnote').textContent = ok ? noteName(r.midi) : '–';
  $('hbar').style.width = Math.min(100, (r.rms || 0) * 600) + 'px';
  keyboard.setHeard(ok ? r.midi : null);
}
const mic = createMic({
  context: sound.audio,
  threshold: () => +$('thr').value,
  onHeard: showHeard,
  onNote: m => engine.input(m, 'mic', 'mic'),
  onHold: m => engine.micHeld(m),
});
$('mic').onclick = async () => {
  sound.audio();
  if (mic.on) {
    mic.stop();
    engine.release('mic'); // a note being held by the mic is let go
    keyboard.setHeard(null);
    $('heard').style.display = 'none';
    $('mic').classList.remove('on');
    $('mic').textContent = '🎤 Mic';
    status('Microphone off.');
    return;
  }
  try {
    await mic.start();
    $('mic').classList.add('on');
    $('mic').textContent = '🎤 On';
    status('Listening… (the mic hears one note at a time)');
  } catch (err) { status('Microphone unavailable: ' + err.message); }
};

// ---------- songs ----------
function refreshSongs(sel) {
  const s = $('song');
  s.innerHTML = '';
  library.options().forEach(o => s.add(new Option(o.label, o.value)));
  s.value = sel || 'b:Ode to Joy';
  if (!s.value) s.selectedIndex = 0;
}
/** Put the engine's settings into the controls (after the engine or saved settings changed them). */
function syncControls() {
  $('hands').value = engine.hands;
  $('split').value = engine.split;
  $('mode').value = engine.mode;
  $('bpm').value = engine.bpm;
  engine.bpm = +$('bpm').value; // the slider rounds to its step
  $('bpmv').textContent = $('bpm').value;
  $('start').style.display = engine.mode === 'tempo' ? '' : 'none';
  syncSegments();
}
/** Open the selected song, using its remembered settings if there are any. */
function pickSong() {
  const value = $('song').value, song = library.source(value), per = $('persong').checked;
  // with per-song memory on, a song reopens as you left it; a new song starts with both hands
  const v = (per && settings.forSong(library.keyOf(value))) ||
    { hands: per ? 'both' : $('hands').value, split: per ? 'auto' : $('split').value, bpm: song.bpm, mode: $('mode').value };
  Object.assign(engine, { hands: v.hands, split: v.split, mode: v.mode, bpm: clamp(v.bpm, 30, 240) });
  syncControls();
  engine.load(song);
  if (!engine.notes.length) { engine.hands = 'both'; syncControls(); engine.load(song); }
}
function readOptions() {
  engine.hold = $('hold').checked;
  engine.wrongFx = $('wrongfx').checked;
}

setupImporter({
  library, status,
  onAdded: value => { refreshSongs(value); pickSong(); },
  onDeleted: () => { refreshSongs(); pickSong(); },
});

// ---------- controls ----------
const syncSegments = makeSegments({ hands: ['Both', 'Right', 'Left'], mode: ['Wait', 'Tempo'] });
const seekbar = setupSeekbar(engine, $('roll'));

$('song').onchange = pickSong;
const changeHands = () => { engine.hands = $('hands').value; engine.split = $('split').value; engine.changeHands(); syncControls(); };
$('hands').onchange = changeHands;
$('split').onchange = changeHands;
$('mode').onchange = () => { engine.setMode($('mode').value); syncControls(); };
$('range').onchange = () => { range = $('range').value.split(',').map(Number); keyboard.build(range); markTarget(); updateLabels(); };
$('start').onclick = () => { sound.audio(); engine.toggleRun(); };
$('listen').onclick = () => { sound.audio(); engine.toggleDemo(); };
$('restart').onclick = () => engine.restart();
$('gear').onclick = () => $('settings').classList.toggle('open');
$('close').onclick = () => $('settings').classList.remove('open');
$('keys').onclick = () => { showKeys = !showKeys; $('keys').classList.toggle('on', showKeys); updateLabels(); settings.save(); };
$('hl').onchange = markTarget;
$('bpm').oninput = () => { $('bpmv').textContent = $('bpm').value; engine.setBpm(+$('bpm').value); };
$('thr').oninput = () => { $('thrv').textContent = $('thr').value; };
$('vol').oninput = () => sound.setVolume(+$('vol').value);
$('reverb').onchange = () => sound.setReverb($('reverb').checked);
$('inst').onchange = () => { // preview the new sound
  if (instrument() === 'grand') sound.loadSamples();
  sound.noteOn(60, 'preview', instrument());
  setTimeout(() => sound.noteOff('preview'), 600);
};
$('reset').onclick = () => {
  if (confirm('Reset all settings to their defaults? Your imported songs are kept.')) { settings.reset(); location.reload(); }
};
document.addEventListener('change', () => { readOptions(); settings.save(); });
document.addEventListener('input', () => settings.save());
$('ver').textContent = BUILD;

// ---------- start ----------
settings.apply();
readOptions();
range = $('range').value.split(',').map(Number);
sound.configure({ volume: +$('vol').value, reverb: $('reverb').checked, status });
refreshSongs(library.valueOf(settings.lastSong));
keyboard.build(range);
updateLabels();
pickSong();

const roll = new Roll($('roll'), engine, () => range);
roll.resize();
(function frame(ts) {
  engine.tick();
  roll.draw(ts);
  seekbar();
  requestAnimationFrame(frame);
})();
