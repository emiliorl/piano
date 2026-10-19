/**
 * Monophonic pitch detection (normalized square difference function).
 * `b` is a Float32Array of samples, `sr` the sample rate, `threshold` the RMS noise gate.
 * Returns {rms} when nothing clear is heard, or {rms, midi} for the fundamental's nearest note.
 */
export function detectPitch(b, sr, threshold) {
  const N = b.length;
  let sum = 0;
  for (let i = 0; i < N; i++) sum += b[i] * b[i];
  const rms = Math.sqrt(sum / N);
  if (rms < threshold) return { rms };

  // lags covering about 2100 Hz down to 60 Hz
  const minTau = Math.floor(sr / 2100), maxTau = Math.min(Math.floor(sr / 60), (N / 2) | 0), W = N - maxTau;
  const nsdf = new Float32Array(maxTau + 1);
  let e0 = 0;
  for (let j = 0; j < W; j++) e0 += b[j] * b[j];
  let eT = 0;
  for (let j = 0; j < W; j++) eT += b[j + minTau - 1] * b[j + minTau - 1];
  for (let tau = minTau; tau <= maxTau; tau++) {
    let c = 0;
    for (let j = 0; j < W; j++) c += b[j] * b[j + tau];
    eT += b[W - 1 + tau] * b[W - 1 + tau] - b[tau - 1] * b[tau - 1]; // slide the window energy
    nsdf[tau] = c / (Math.sqrt(e0 * Math.max(eT, 0)) + 1e-9);
  }

  // the highest point of each positive stretch is a candidate period
  const peaks = [];
  let tau = minTau;
  while (tau < maxTau && nsdf[tau] > 0) tau++;
  while (tau < maxTau) {
    while (tau < maxTau && nsdf[tau] <= 0) tau++;
    let best = -1;
    while (tau < maxTau && nsdf[tau] > 0) {
      if (best < 0 || nsdf[tau] > nsdf[best]) best = tau;
      tau++;
    }
    if (best > 0) peaks.push(best);
  }
  if (!peaks.length) return { rms };

  // the first peak that is nearly as strong as the strongest is the fundamental
  const mx = Math.max(...peaks.map(p => nsdf[p]));
  const p = peaks.find(q => nsdf[q] >= 0.85 * mx);
  if (nsdf[p] < 0.5) return { rms };

  // parabolic interpolation for a sub-sample period
  const y1 = nsdf[p - 1], y2 = nsdf[p], y3 = nsdf[p + 1];
  const d = (y3 - y1) / (2 * (2 * y2 - y1 - y3) || 1e-9);
  return { rms, midi: Math.round(69 + 12 * Math.log2(sr / (p + d) / 440)) };
}
