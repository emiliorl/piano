// Sound: a Web Audio engine with several instruments. A note sounds until it is released.
import { hz } from './util.js';

let ac, bus, master, wet;
const initial = { volume: 0.8, reverb: true };
let onStatus = () => {};

/** Set start-up values and a callback for loading messages. Call before the first sound. */
export function configure({ volume, reverb, status }) {
  if (volume != null) initial.volume = volume;
  if (reverb != null) initial.reverb = reverb;
  if (status) onStatus = status;
}
export const setVolume = v => { if (master) master.gain.value = v; initial.volume = v; };
export const setReverb = on => { if (wet) wet.gain.value = on ? 0.25 : 0; initial.reverb = on; };

/** The shared AudioContext, created (and resumed) on first use. */
export function audio() {
  if (!ac) {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = initial.volume;
    const comp = ac.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ac.destination);
    bus = ac.createGain();
    bus.connect(master);
    // small generated room reverb
    const len = Math.floor(ac.sampleRate * 1.8), ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    const conv = ac.createConvolver();
    conv.buffer = ir;
    wet = ac.createGain();
    wet.gain.value = initial.reverb ? 0.25 : 0;
    bus.connect(conv);
    conv.connect(wet);
    wet.connect(master);
  }
  if (ac.state === 'suspended') ac.resume();
  return ac;
}

let noiseBuf;
function noise(c) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, Math.floor(c.sampleRate * 0.2), c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

// A voice is {release(t)}; it keeps sounding until released (key up).
function mkVoice(c, out, oscs, relTau) {
  oscs.forEach(o => { try { o.stop(c.currentTime + 20); } catch (e) { /* already stopped */ } });
  return {
    release(t) {
      out.gain.setTargetAtTime(0, t, relTau);
      setTimeout(() => { oscs.forEach(o => { try { o.stop(); } catch (e) { /* already stopped */ } }); out.disconnect(); }, relTau * 8000 + 100);
    },
  };
}

// Additive piano: inharmonic partials, two detuned strings, hammer thump, two-stage decay.
function synthPiano(c, m, t) {
  const f = hz(m), out = c.createGain();
  out.gain.value = 0.5;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = Math.min(9000, f * 10 + 1500); lp.Q.value = 0.3;
  lp.connect(out); out.connect(bus);
  const oscs = [], B = 0.00025 * (1 + Math.max(0, m - 60) / 12), ring = 2.2 + (108 - m) / 108 * 3.5;
  const nP = m < 48 ? 12 : m < 72 ? 9 : m < 96 ? 6 : 4;
  for (let n = 1; n <= nP; n++) {
    const fn = f * n * Math.sqrt(1 + B * n * n);
    if (fn > 14000) break;
    const a = 0.55 / Math.pow(n, 1.15) * (n === 2 ? 1.2 : 1), tau = Math.max(0.12, ring / Math.pow(n, 0.75));
    for (const det of [-1.5, 1.5]) {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = fn; o.detune.value = det * (n > 1 ? 1.5 : 1);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(a / 2 * 1.5, t + 0.004);
      g.gain.setTargetAtTime(a / 2 * 0.55, t + 0.004, 0.12); // quick drop after the strike
      g.gain.setTargetAtTime(0, t + 0.45, tau); // then the long ring
      o.connect(g).connect(lp); o.start(t); oscs.push(o);
    }
  }
  const nb = c.createBufferSource();
  nb.buffer = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = Math.min(5000, f * 4); bp.Q.value = 0.8;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.25, t); ng.gain.setTargetAtTime(0, t, 0.012);
  nb.connect(bp).connect(ng).connect(out); nb.start(t); nb.stop(t + 0.15);
  return mkVoice(c, out, oscs, 0.09);
}

function electricPiano(c, m, t) {
  const f = hz(m), out = c.createGain();
  out.gain.value = 0.5; out.connect(bus);
  const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
  car.frequency.value = f; mod.frequency.value = f;
  mg.gain.setValueAtTime(f * 2.2, t); mg.gain.setTargetAtTime(f * 0.25, t, 0.5);
  mod.connect(mg).connect(car.frequency);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.8, t + 0.003);
  g.gain.setTargetAtTime(0.18, t + 0.003, 0.25); g.gain.setTargetAtTime(0, t + 1, 1.8);
  car.connect(g).connect(out);
  const tn = c.createOscillator(), tg = c.createGain();
  tn.frequency.value = f * 7;
  tg.gain.setValueAtTime(0.08, t); tg.gain.setTargetAtTime(0, t, 0.05);
  tn.connect(tg).connect(out);
  [car, mod, tn].forEach(o => o.start(t));
  return mkVoice(c, out, [car, mod, tn], 0.12);
}

function organ(c, m, t) {
  const f = hz(m), out = c.createGain();
  out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.3, t + 0.015); out.connect(bus);
  const oscs = [1, 2, 3, 4].map((h, i) => {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.value = f * h; g.gain.value = [0.5, 0.35, 0.2, 0.12][i];
    o.connect(g).connect(out); o.start(t);
    return o;
  });
  return mkVoice(c, out, oscs, 0.05);
}

function musicBox(c, m, t) {
  const f = hz(Math.min(m + 12, 115)), out = c.createGain();
  out.gain.value = 0.5; out.connect(bus);
  const oscs = [[1, 1, 1.2], [2.99, 0.35, 0.5], [5.4, 0.15, 0.3]].map(([r, a, tau]) => {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.value = f * r;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.002); g.gain.setTargetAtTime(0, t + 0.002, tau);
    o.connect(g).connect(out); o.start(t);
    return o;
  });
  return mkVoice(c, out, oscs, 0.1);
}

function strings(c, m, t) {
  const f = hz(m), out = c.createGain();
  out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.25, t + 0.25);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = Math.min(3000, f * 5);
  lp.connect(out); out.connect(bus);
  const oscs = [-7, 7].map(d => {
    const o = c.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
    o.connect(lp); o.start(t);
    return o;
  });
  return mkVoice(c, out, oscs, 0.25);
}

// Recorded grand piano (Salamander Grand Piano, CC-BY 3.0, hosted by Tone.js), loaded on demand.
const SAMPLE_URL = 'https://tonejs.github.io/audio/salamander/', samples = {};
let sampleState = 'idle'; // idle | loading | ready | failed
export const samplesReady = () => sampleState === 'ready';

export function loadSamples() {
  if (sampleState !== 'idle') return;
  sampleState = 'loading';
  const list = [[21, 'A0']];
  for (let o = 1; o <= 7; o++) [['C', 0], ['Ds', 3], ['Fs', 6], ['A', 9]].forEach(([n, off]) => list.push([12 * (o + 1) + off, n + o]));
  list.push([108, 'C8']);
  const c = audio();
  let n = 0;
  Promise.all(list.map(async ([midi, name]) => {
    const r = await fetch(SAMPLE_URL + name + '.mp3');
    if (!r.ok) throw new Error(r.status);
    samples[midi] = await c.decodeAudioData(await r.arrayBuffer());
    onStatus(`Loading grand piano sound ${++n}/${list.length}…`);
  })).then(() => { sampleState = 'ready'; onStatus('Grand piano sound loaded.'); })
    .catch(() => { sampleState = 'failed'; onStatus('Could not load the grand piano sound (offline?). Using the synth piano.'); });
}

function sampleVoice(c, m, t) {
  const keys = Object.keys(samples).map(Number);
  const sm = keys.reduce((a, b) => (Math.abs(b - m) < Math.abs(a - m) ? b : a));
  const s = c.createBufferSource(), g = c.createGain();
  s.buffer = samples[sm]; s.playbackRate.value = 2 ** ((m - sm) / 12); g.gain.value = 0.9;
  s.connect(g).connect(bus); s.start(t);
  return { release(t2) { g.gain.setTargetAtTime(0, t2, 0.12); setTimeout(() => { try { s.stop(); } catch (e) { /* done */ } g.disconnect(); }, 1200); } };
}

export const INSTRUMENTS = {
  grand: (c, m, t) => (sampleState === 'ready' ? sampleVoice(c, m, t) : synthPiano(c, m, t)),
  synth: synthPiano, epiano: electricPiano, organ, box: musicBox, strings,
};

const voices = new Map();

/** Start a note that sounds until noteOff(key). `key` identifies this press. */
export function noteOn(m, key, instrument) {
  noteOff(key);
  const c = audio();
  if (instrument === 'grand') loadSamples();
  voices.set(key, INSTRUMENTS[instrument](c, m, c.currentTime));
}

export function noteOff(key) {
  const v = voices.get(key);
  if (v) { v.release(ac.currentTime); voices.delete(key); }
}
