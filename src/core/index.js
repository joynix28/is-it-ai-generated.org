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
export { detectSlop, slopScore, deslop, SLOP_PATTERNS } from './slop.js';
export { extractFeatures, extractSentenceFeatures } from './textFeatures.js';
export { countText, countWords, estimateSyllables } from './wordCounter.js';
export { analyzeImage, perceptualHashes } from './imageDetector.js';
export { detectLanguage, isRTL, LANGUAGE_NAMES } from './langdetect.js';
export { splitSentences, tokenizeWords, splitParagraphs } from './tokenize.js';
export { readMetadata, detectFormat } from './exif.js';

export const VERSION = '0.1.0';

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
