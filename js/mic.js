// Microphone input: captures raw audio, runs the pitch detector and reports notes.
import { detectPitch } from './pitch.js';

/**
 * options:
 *   context()   -> the AudioContext
 *   threshold() -> RMS noise gate
 *   onHeard(r)  -> every reading ({rms, midi?}) for the on-screen readout
 *   onNote(m)   -> a new note was played (stable and freshly struck)
 *   onHold(m)   -> the current reading, to keep a held note alive
 */
export function createMic({ context, threshold, onHeard, onNote, onHold }) {
  let analyser, buf, stream, node;
  let on = false, cand = null, candN = 0, prevRms = 0, lastMidi = -1;

  function loop() {
    if (!on) return;
    analyser.getFloatTimeDomainData(buf);
    const r = detectPitch(buf, context().sampleRate, threshold());
    onHeard(r);
    onHold(r.midi);
    if (r.midi != null && r.midi >= 21 && r.midi <= 108) {
      if (r.midi === cand) candN++; else { cand = r.midi; candN = 1; }
      // a repeated note needs a fresh attack (a jump in volume)
      const onset = r.rms > prevRms * 1.25 || r.midi !== lastMidi;
      if (candN >= 2 && onset) { lastMidi = r.midi; candN = 0; onNote(r.midi); }
    } else {
      cand = null; candN = 0;
      if (!r.rms || r.rms < threshold()) lastMidi = -1;
    }
    prevRms = r.rms || 0;
    setTimeout(loop, 20);
  }

  return {
    get on() { return on; },

    /** Ask for the microphone (raw audio: no echo cancellation, noise suppression or gain control). */
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const c = context();
      node = c.createMediaStreamSource(stream);
      analyser = c.createAnalyser();
      analyser.fftSize = 4096;
      buf = new Float32Array(analyser.fftSize);
      node.connect(analyser);
      on = true;
      loop();
    },

    /** Stop the loop and release the device so the browser stops showing it as recording. */
    stop() {
      on = false;
      node?.disconnect();
      stream?.getTracks().forEach(t => t.stop());
      stream = node = analyser = null;
      cand = null; candN = 0; lastMidi = -1; prevRms = 0;
    },
  };
}
