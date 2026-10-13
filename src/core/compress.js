/**
 * Compression-based signal.
 *
 * Highly predictable text compresses well. LLM output, which is optimised for
 * fluency and low surprisal, tends to compress a little better than human
 * writing. This is the `compressibility` signal from lynote-ai/ai-text-detector
 * (MIT), reimplemented as a synchronous LZW measurement so it can run inside
 * the synchronous detector in every runtime.
 */

/**
 * LZW over bytes. Returns the number of emitted codes and the total encoded
 * bits, which is enough to estimate the compression ratio.
 * @param {Uint8Array} bytes
 */
function lzwStats(bytes) {
  const dict = new Map();
  let next = 256;
  let codes = 0;
  let bits = 8; // first code
  let prev = -1;

  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i];
    if (prev === -1) {
      prev = b;
      continue;
    }
    const key = prev * 256 + b;
    const found = dict.get(key);
    if (found !== undefined) {
      prev = found;
    } else {
      if (next < 65536) dict.set(key, next++);
      const width = Math.max(8, Math.ceil(Math.log2(next)));
      bits += width;
      codes += 1;
      prev = b;
    }
  }
  if (prev !== -1) bits += Math.max(8, Math.ceil(Math.log2(next)));
  return { codes, bits };
}

/**
 * @param {string} text
 * @returns {{ratio:number, bytes:number, compressedBytes:number}}
 */
export function compressibility(text) {
  const src = text || '';
  const bytes = new TextEncoder().encode(src);
  if (bytes.length < 32) return { ratio: 1, bytes: bytes.length, compressedBytes: bytes.length };
  const { bits } = lzwStats(bytes);
  const compressedBytes = bits / 8;
  return {
    ratio: compressedBytes / bytes.length,
    bytes: bytes.length,
    compressedBytes: Math.round(compressedBytes),
  };
}

/**
 * Map a compression ratio to a 0..1 "machine-like" value.
 * Lower ratio (more compressible) scores higher.
 */
export function compressibilityScore(ratio) {
  const t = (0.55 - ratio) / 0.28;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}
