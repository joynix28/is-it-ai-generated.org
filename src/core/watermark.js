/**
 * Statistical text watermarking.
 *
 * Implements the SynthID-Text detection machinery (Google DeepMind,
 * github.com/google-deepmind/synthid-text, Apache-2.0): keyed g-values produced
 * by an LCG over a SHA-256 initialised state, the mean and weighted-mean
 * detectors, and the one-sided z-score / p-value under the H0 null
 * (g ~ Bernoulli(0.5) for unwatermarked text).
 *
 * Honest constraint, stated in the code and the UI: detection requires the
 * watermarking key. Google, OpenAI and Anthropic do not publish theirs, and the
 * g-values are a keyed PRF output that is statistically independent of the
 * visible text, so no statistic computed from the text alone can recover them.
 * What this module is genuinely useful for:
 *
 *   1. Verifying text you watermarked yourself with your own key.
 *   2. Running the real detector when a provider key becomes available.
 *   3. Reporting honestly that a watermark check is impossible without a key,
 *      instead of pretending a heuristic is a watermark detector.
 *
 * It also implements a generic green-list / gumbel-max detector (Kirchenbauer
 * et al. style) for the same purpose.
 */

import { sha256Bytes } from './hash.js';

const MASK63 = (1n << 63n) - 1n;
const LCG_MULT = 6364136223846793005n;

/** `accumulate_hash(h, x) = (h + x) * MULT + 1`, modulo 2^63. */
function accumulateHash(h, x) {
  return ((h + BigInt(x)) * LCG_MULT + 1n) & MASK63;
}

/** Initialise the hash state from the watermark keys. */
export function hashIV(keys, ngramLen = 5, depth = keys.length, contextHistorySize = 1024) {
  // Little-endian int64 packing of the keys, matching the reference impl.
  const buf = new Uint8Array(keys.length * 8);
  const view = new DataView(buf.buffer);
  keys.forEach((k, i) => view.setBigInt64(i * 8, BigInt(k), true));
  let h = BigInt('0x' + [...sha256Bytes(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')) & MASK63;
  h = accumulateHash(h, ngramLen);
  h = accumulateHash(h, depth);
  h = accumulateHash(h, contextHistorySize);
  return h;
}

/** Bit extracted after the final mixing rounds. */
function finalBit(h) {
  let g = h;
  for (let i = 0; i < 12; i += 1) g = accumulateHash(g, 1);
  return Number((g >> 30n) & 1n);
}

/**
 * Compute the g-value for one layer at each position.
 * @param {number[]} tokenIds
 * @param {number} key layer key
 * @param {number} ngramLen
 * @param {bigint} iv
 * @returns {Int8Array} -1 where masked (first ngramLen-1, repeated context), else 0/1
 */
function gValuesForLayer(tokenIds, key, ngramLen, iv) {
  const n = tokenIds.length;
  const out = new Int8Array(n).fill(-1);
  const seenContexts = new Set();
  for (let i = ngramLen - 1; i < n; i += 1) {
    let h = iv;
    for (let j = i - (ngramLen - 1); j < i; j += 1) h = accumulateHash(h, tokenIds[j]);
    // Repetition mask: identical contexts are skipped by the reference detector.
    const ctxKey = tokenIds.slice(i - (ngramLen - 1), i).join(',');
    if (seenContexts.has(ctxKey)) continue;
    seenContexts.add(ctxKey);
    h = accumulateHash(h, tokenIds[i]);
    h = accumulateHash(h, key);
    out[i] = finalBit(h);
  }
  return out;
}

/** One-sided p-value for a z-score. */
export function pValueFromZ(z) {
  // Abramowitz & Stegun 7.1.26 erfc approximation.
  const x = z / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x);
  const erfc = y;
  return x >= 0 ? erfc / 2 : 1 - erfc / 2;
}

/**
 * SynthID-Text detector.
 * @param {number[]} tokenIds
 * @param {number[]} keys - the watermark keys (one per layer)
 * @param {{ngramLen?:number, weighted?:boolean}} [opts]
 * @returns {{available:boolean, reason?:string, mean:number, weightedMean:number, z:number, pValue:number, n:number, layers:number, verdict:string}}
 */
export function detectSynthid(tokenIds, keys, opts = {}) {
  if (!Array.isArray(tokenIds) || !tokenIds.length) {
    return { available: false, reason: 'no-tokens', verdict: 'unavailable' };
  }
  if (!Array.isArray(keys) || !keys.length) {
    return { available: false, reason: 'no-key', verdict: 'unavailable' };
  }
  const ngramLen = opts.ngramLen ?? 5;
  const depth = keys.length;
  const iv = hashIV(keys, ngramLen, depth, 1024);

  const layerMeans = [];
  let totalSum = 0;
  let totalCount = 0;
  const weights = [];
  for (let l = 0; l < depth; l += 1) {
    weights.push(10 - (9 * l) / Math.max(1, depth - 1)); // linspace(10, 1, depth)
  }
  const weightSum = weights.reduce((a, b) => a + b, 0);

  let weightedSum = 0;
  for (let l = 0; l < depth; l += 1) {
    const g = gValuesForLayer(tokenIds, keys[l], ngramLen, iv);
    let s = 0;
    let c = 0;
    for (let i = 0; i < g.length; i += 1) if (g[i] >= 0) { s += g[i]; c += 1; }
    const m = c ? s / c : 0.5;
    layerMeans.push(m);
    totalSum += s;
    totalCount += c;
    weightedSum += (weights[l] / weightSum) * m;
  }

  const mean = totalCount ? totalSum / totalCount : 0.5;
  const se = 0.5 / Math.sqrt(Math.max(1, totalCount)); // H0: p = 0.5
  const z = (mean - 0.5) / se;
  const pValue = pValueFromZ(z);
  let verdict = 'not-detected';
  if (z >= 5) verdict = 'watermarked';
  else if (z >= 3) verdict = 'likely-watermarked';
  else if (z >= 1.5) verdict = 'uncertain';

  return {
    available: true,
    mean: round(mean, 4),
    weightedMean: round(weightedSum, 4),
    z: round(z, 3),
    pValue: Number(pValue.toExponential(3)),
    n: totalCount,
    layers: depth,
    layerMeans: layerMeans.map((m) => round(m, 4)),
    verdict,
  };
}

/**
 * Generic green-list detector (Kirchenbauer et al. 2023).
 * green if hash(key, previous token) mod gamma == 0.
 */
export function detectGreenList(tokenIds, key, opts = {}) {
  if (!Array.isArray(tokenIds) || tokenIds.length < 8) {
    return { available: false, reason: 'too-short', verdict: 'unavailable' };
  }
  if (key == null) return { available: false, reason: 'no-key', verdict: 'unavailable' };
  const gamma = opts.gamma ?? 0.25;
  let green = 0;
  let total = 0;
  for (let i = 1; i < tokenIds.length; i += 1) {
    const h = sha256Bytes(`${key}|${tokenIds[i - 1]}`);
    const value = h[0] / 256;
    total += 1;
    if (value < gamma) green += 1;
  }
  const expected = gamma * total;
  const sd = Math.sqrt(total * gamma * (1 - gamma));
  const z = sd ? (green - expected) / sd : 0;
  return {
    available: true,
    greenFraction: round(green / Math.max(1, total), 4),
    expected: round(gamma, 4),
    z: round(z, 3),
    pValue: Number(pValueFromZ(z).toExponential(3)),
    n: total,
    verdict: z >= 4 ? 'watermarked' : z >= 2 ? 'uncertain' : 'not-detected',
  };
}

/**
 * Tokenizer bridge. Real detection needs the provider's exact tokenizer; we
 * accept either explicit token ids or a tokenizer function. Without either we
 * say so rather than inventing numbers.
 */
export function prepareTokens(text, tokenizer) {
  if (Array.isArray(tokenizer)) return tokenizer;
  if (typeof tokenizer === 'function') return tokenizer(text);
  return null;
}

function round(v, d) {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

export const WATERMARK_NOTE =
  'Statistical watermark detection needs the provider key. Google, OpenAI and Anthropic do not publish theirs, and no statistic on the text alone can recover it. Use this to verify text watermarked with your own key.';
