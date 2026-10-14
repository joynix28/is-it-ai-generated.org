/**
 * The learned image probe.
 *
 * This is not our invention and it is not a heuristic. It is the trained linear
 * probe published by Rinne414/SynthID-detector (MIT): a frozen CLIP ViT-L/14
 * encoder maps an image to a 1024-dimensional embedding, the embedding is
 * L2-normalised, and a logistic-regression layer scores "machine-generated".
 *
 * Their numbers, measured held out and not in sample: AUC 0.998 on a mixed
 * held-out set, 0.0 % missed AI images, 1.8 % of real photos flagged, and — the
 * metric that matters — AUC 0.97 to 1.00 when trained on one generator and
 * tested on a different, unseen one. The only artifact copied here is the probe
 * itself: 1024 coefficients, an intercept and a threshold, published under MIT.
 * The 293 MB CLIP encoder is downloaded by the reader's browser, never bundled.
 *
 * What it is not: a watermark decoder. SynthID and friends are invisible
 * watermarks that need the owner's key. This probe reads pixels, and it is
 * honest about being a probability, not a verdict.
 */

/** CLIP ViT-L/14 image embedding dimension. */
export const PROBE_DIM = 1024;

/** The 1024 float32 coefficients, little-endian, base64-encoded. */
const COEF_B64 =
  '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';

/** Logistic-regression intercept. */
export const PROBE_INTERCEPT = 0.04680592939257622;
/** Calibrated decision threshold (joint false-positive/false-negative optimum). */
export const PROBE_THRESHOLD = 0.4582911431789398;
/**
 * Training fed every image through a JPEG round-trip at quality 88 before the
 * encoder, so the probe would not key on one compression level. Inference does
 * the same, or the reading shifts.
 */
export const PROBE_JPEG_QUALITY = 0.88;
/** The frozen encoder, named as the probe's own metadata names it. */
export const PROBE_BACKBONE = 'vit_large_patch14_clip_224.openai';

let cached: Float32Array | null = null;

function coefficients(): Float32Array {
  if (cached) return cached;
  const binary = atob(COEF_B64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  cached = new Float32Array(bytes.buffer);
  return cached;
}

export interface ProbeOutcome {
  /** Probability that the image is machine-generated, 0..1. */
  probability: number;
  /** True when it crosses the calibrated threshold. */
  isAi: boolean;
}

/**
 * The decoded coefficients.
 *
 * Exposed so a test can prove the base64 block is byte-for-byte the published
 * probe, rather than a plausible-looking block of numbers nobody ever checked.
 */
export function probeCoefficients(): Float32Array {
  return coefficients();
}

/**
 * L2-normalise the embedding, apply the probe, apply the sigmoid.
 *
 * Returns null when the embedding is not 1024-dimensional, so a wrong encoder
 * fails loudly instead of producing a plausible number from the wrong features.
 */
export function probeScore(embedding: ArrayLike<number>): ProbeOutcome | null {
  if (embedding.length !== PROBE_DIM) return null;
  const weights = coefficients();

  let squared = 0;
  for (let i = 0; i < PROBE_DIM; i += 1) squared += embedding[i]! * embedding[i]!;
  const norm = Math.sqrt(squared) + 1e-8;

  let logit = PROBE_INTERCEPT;
  for (let i = 0; i < PROBE_DIM; i += 1) logit += (embedding[i]! / norm) * weights[i]!;

  const probability = 1 / (1 + Math.exp(-logit));
  return { probability, isAi: probability >= PROBE_THRESHOLD };
}
