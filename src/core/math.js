/**
 * Small numerical helpers used by the detectors.
 */

export const clamp = (v, min = 0, max = 1) => (v < min ? min : v > max ? max : v);

/** Linear map with clamping. */
export function mapLinear(v, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return outMin;
  const t = clamp((v - inMin) / (inMax - inMin), 0, 1);
  return outMin + t * (outMax - outMin);
}

/** Inverse linear map: high input -> low output. */
export function mapInverse(v, inMin, inMax, outMin, outMax) {
  return mapLinear(v, inMin, inMax, outMax, outMin);
}

export function mean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

export function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let s = 0;
  for (const v of arr) s += (v - m) ** 2;
  return Math.sqrt(s / (arr.length - 1));
}

/** Population standard deviation (n divisor). */
export function stdp(arr) {
  if (!arr.length) return 0;
  const m = mean(arr);
  let s = 0;
  for (const v of arr) s += (v - m) ** 2;
  return Math.sqrt(s / arr.length);
}

export function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/** Shannon entropy in bits of a discrete distribution of counts. */
export function entropy(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  let h = 0;
  for (const c of counts) {
    if (!c) continue;
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Coefficient of variation (std / mean). */
export function cv(arr) {
  const m = mean(arr);
  if (!m) return 0;
  return stdp(arr) / m;
}

/** Pearson correlation between two equally sized arrays. */
export function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

/** Logistic function, useful for squashing a raw score. */
export function logistic(x) {
  return 1 / (1 + Math.exp(-x));
}

/** Round to a fixed number of decimals. */
export const round = (v, d = 2) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};
