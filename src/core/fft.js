/**
 * Minimal radix-2 iterative FFT (in-place, complex) plus a 2D wrapper.
 * Used for the frequency-domain analysis of images. Dependency-free and
 * deterministic so the browser and the server produce identical numbers.
 */

/**
 * In-place FFT on interleaved complex data [re0, im0, re1, im1, ...].
 * Length must be a power of two.
 * @param {Float64Array} data
 * @param {boolean} inverse
 */
export function fft1d(data, inverse = false) {
  const n = data.length >> 1;
  if (n <= 1) return data;

  // Bit-reversal permutation.
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = data[2 * i];
      const ti = data[2 * i + 1];
      data[2 * i] = data[2 * j];
      data[2 * i + 1] = data[2 * j + 1];
      data[2 * j] = tr;
      data[2 * j + 1] = ti;
    }
  }

  const sign = inverse ? 1 : -1;
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (sign * 2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let k = 0; k < len / 2; k += 1) {
        const uRe = data[2 * (i + k)];
        const uIm = data[2 * (i + k) + 1];
        const vRe = data[2 * (i + k + len / 2)] * curRe - data[2 * (i + k + len / 2) + 1] * curIm;
        const vIm = data[2 * (i + k + len / 2)] * curIm + data[2 * (i + k + len / 2) + 1] * curRe;
        data[2 * (i + k)] = uRe + vRe;
        data[2 * (i + k) + 1] = uIm + vIm;
        data[2 * (i + k + len / 2)] = uRe - vRe;
        data[2 * (i + k + len / 2) + 1] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < data.length; i += 1) data[i] /= n;
  }
  return data;
}

/** Largest power of two <= v (min 1). */
export function floorPow2(v) {
  let p = 1;
  while (p * 2 <= v) p *= 2;
  return p;
}

/**
 * 2D FFT magnitude spectrum of a grayscale matrix.
 * @param {Float64Array} gray - row-major, size*size
 * @param {number} size - must be a power of two
 * @returns {Float64Array} magnitude spectrum, normalized to [0,1]
 */
export function fft2dMagnitude(gray, size) {
  const data = new Float64Array(size * size * 2);
  for (let i = 0; i < size * size; i += 1) data[2 * i] = gray[i];
  // Rows
  const row = new Float64Array(size * 2);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      row[2 * x] = data[2 * (y * size + x)];
      row[2 * x + 1] = data[2 * (y * size + x) + 1];
    }
    fft1d(row, false);
    for (let x = 0; x < size; x += 1) {
      data[2 * (y * size + x)] = row[2 * x];
      data[2 * (y * size + x) + 1] = row[2 * x + 1];
    }
  }
  // Columns
  const col = new Float64Array(size * 2);
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) {
      col[2 * y] = data[2 * (y * size + x)];
      col[2 * y + 1] = data[2 * (y * size + x) + 1];
    }
    fft1d(col, false);
    for (let y = 0; y < size; y += 1) {
      data[2 * (y * size + x)] = col[2 * y];
      data[2 * (y * size + x) + 1] = col[2 * y + 1];
    }
  }

  const mag = new Float64Array(size * size);
  let max = 1e-9;
  for (let i = 0; i < size * size; i += 1) {
    const m = Math.hypot(data[2 * i], data[2 * i + 1]);
    mag[i] = m;
    if (m > max) max = m;
  }
  for (let i = 0; i < mag.length; i += 1) mag[i] /= max;
  return mag;
}

/**
 * Ratio of energy above a normalized frequency radius (0..1).
 * AI-generated images frequently show an abnormal amount of high-frequency
 * energy (or an abnormally clean falloff).
 * @param {Float64Array} mag - from fft2dMagnitude
 * @param {number} size
 * @param {number} radius - normalized [0,1]
 */
export function highFrequencyRatio(mag, size, radius = 0.5) {
  const cx = size / 2;
  const cy = size / 2;
  const r = radius * (size / 2);
  let hi = 0;
  let total = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const v = mag[y * size + x] ** 2; // power
      total += v;
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) hi += v;
    }
  }
  return total === 0 ? 0 : hi / total;
}
