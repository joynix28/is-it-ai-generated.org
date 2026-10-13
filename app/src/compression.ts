/**
 * Kolmogorov-style compression entropy.
 *
 * Language models emit low-surprisal token sequences, so their text carries
 * more binary redundancy than human writing. We measure it the way the ZipPy /
 * NCD line of work does: compress the normalised UTF-8 bytes and look at the
 * ratio, corrected for length because long texts always compress better.
 *
 * Uses the native CompressionStream('deflate-raw'). No dependency, no server.
 * It is async by nature, so it runs after Layer 1 and augments the reading
 * rather than blocking it.
 */

export interface CompressionReport {
  rawBytes: number;
  compressedBytes: number;
  /** compressed / raw, before correction. */
  ratio: number;
  /** Ratio corrected for length; lower means more redundant. */
  corrected: number;
  /** 0..1 machine-likelihood from compression alone. */
  score: number;
  available: boolean;
}

/** Deflate the UTF-8 bytes and count them. */
async function deflateSize(text: string): Promise<number> {
  const bytes = new TextEncoder().encode(text);
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const reader = stream.getReader();
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
  }
  return total;
}

/**
 * @param text raw document
 */
export async function compressionEntropy(text: string): Promise<CompressionReport> {
  const empty: CompressionReport = {
    rawBytes: 0, compressedBytes: 0, ratio: 1, corrected: 1, score: 0, available: false,
  };
  if (typeof CompressionStream === 'undefined' || text.length < 200) return empty;

  const bytes = new TextEncoder().encode(text);
  const compressed = await deflateSize(text);
  const ratio = compressed / Math.max(1, bytes.length);

  // Long texts compress better for free; correct with the length curve.
  const expected = 0.30 + 0.22 * Math.exp(-bytes.length / 4000);
  const corrected = ratio / Math.max(0.05, expected);
  // corrected < 1 means the text is more redundant than length predicts.
  const score = Math.max(0, Math.min(1, (1.02 - corrected) / 0.35));

  return {
    rawBytes: bytes.length,
    compressedBytes: compressed,
    ratio: Math.round(ratio * 1000) / 1000,
    corrected: Math.round(corrected * 1000) / 1000,
    score: Math.round(score * 1000) / 1000,
    available: true,
  };
}
