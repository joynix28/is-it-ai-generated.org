/**
 * is-it-ai-generated — public API.
 *
 * Everything is dependency-free ESM and runs in the browser, in Node, and in
 * Cloudflare Workers / Pages Functions.
 *
 * @example
 * import { detectText, analyzeImage, countText, detectLanguage } from 'is-it-ai-generated';
 * const report = detectText('Some text to check.');
 * console.log(report.score, report.verdict);
 */

import { detectText } from './textDetector.js';
import { countText } from './wordCounter.js';

export { detectText, compareTexts, fingerprint, DEFAULT_WEIGHTS, VERDICTS } from './textDetector.js';
export { detectSlop, slopScore, deslop, SLOP_PATTERNS, catalogScan, catalogScore } from './slop.js';
export { extractFeatures, extractSentenceFeatures } from './textFeatures.js';
export { countText, countWords, estimateSyllables } from './wordCounter.js';
export { analyzeImage, perceptualHashes } from './imageDetector.js';
export { detectLanguage, isRTL, LANGUAGE_NAMES } from './langdetect.js';
export { splitSentences, tokenizeWords, splitParagraphs } from './tokenize.js';
export { readMetadata, detectFormat } from './exif.js';

// New in v0.2: Unicode forensics, C2PA, statistical watermarks, hashing.
export { scanUnicode, decodeTagPayload, INVISIBLE_RANGES } from './unicode.js';
export { analyzeC2pa, verifyC2pa, c2paSummary, findJumbfStore } from './c2pa.js';
export { detectSynthid, detectGreenList, hashIV, WATERMARK_NOTE } from './watermark.js';
export { compressibility, compressibilityScore } from './compress.js';
export { sha256Hex, sha256Bytes } from './hash.js';
export { decodeCbor, toPlain } from './cbor.js';

export const VERSION = '0.3.0';

/**
 * One-call convenience wrapper: AI index + slop findings + word statistics.
 * @param {string} text
 * @param {object} [options]
 */
export function analyzeText(text, options = {}) {
  return {
    detection: detectText(text, options),
    stats: countText(text, options),
  };
}
