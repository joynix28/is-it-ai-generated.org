/**
 * AI text detector.
 *
 * Layers, in order of strength:
 *   1. Unicode forensics  — invisible characters, tag-character smuggling,
 *                           homoglyph/confusable substitution.
 *   2. Statistical watermark — SynthID-Text / green-list detectors, usable with
 *                           a key. Reports honestly when no key is available.
 *   3. Slop catalogue     — named AI writing patterns with quotes and fixes.
 *   4. Stylometry         — 16 weighted features including compressibility,
 *                           lexical diversity and burstiness.
 *
 * Every contribution is exposed in the result, so the UI can show why a text
 * scored the way it did. This is a heuristic index and never proof of
 * authorship.
 */

import { extractFeatures, extractSentenceFeatures } from './textFeatures.js';
import { detectSlop } from './slop.js';
import { detectLanguage } from './langdetect.js';
import { scanUnicode } from './unicode.js';
import { detectSynthid, detectGreenList, WATERMARK_NOTE } from './watermark.js';
import { clamp, mapLinear, mapInverse, logistic, round } from './math.js';
import { splitSentences, tokenizeWords, countWords } from './tokenize.js';

/**
 * Feature weights. Raising a weight makes that signal matter more.
 * Exported so callers can tune or explain the model.
 */
export const DEFAULT_WEIGHTS = {
  unicode: 1.8,
  aiPhrases: 2.0,
  slop: 1.4,
  burstiness: 1.5,
  transitions: 1.2,
  sentenceStarts: 1.0,
  pronounVoice: 1.0,
  compressibility: 0.8,
  repetition: 0.9,
  paragraphUniformity: 0.8,
  hedges: 0.8,
  contractions: 0.8,
  emDash: 0.7,
  lexicalSmoothness: 0.6,
  structuredShape: 0.6,
  punctuation: 0.5,
  colonDensity: 0.4,
  lexicalVariety: 0.4,
};

export const VERDICTS = [
  { max: 20, id: 'human', key: 'verdict.human' },
  { max: 40, id: 'likely-human', key: 'verdict.likelyHuman' },
  { max: 60, id: 'uncertain', key: 'verdict.uncertain' },
  { max: 80, id: 'likely-ai', key: 'verdict.likelyAI' },
  { max: 101, id: 'ai', key: 'verdict.ai' },
];

/** Fast, allocation-light fingerprint (two FNV-1a passes). */
export function fingerprint(text) {
  const s = text || '';
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= (c + (i & 0xff));
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  const hex = (n) => n.toString(16).padStart(8, '0');
  return `${hex(h1)}${hex(h2)}`;
}

function verdictFor(score) {
  return VERDICTS.find((v) => score < v.max) || VERDICTS[VERDICTS.length - 1];
}

/** Compute every stylometric component in 0..1 with its weight. */
function computeComponents(features, slopScore01) {
  const f = features;
  const comp = [];
  const add = (id, value, weight, label) => comp.push({ id, value: clamp(value, 0, 1), weight, label });

  add('aiPhrases', mapLinear(f.aiPhrases.densityPer100, 0.05, 2.2, 0, 1), DEFAULT_WEIGHTS.aiPhrases, 'features.aiPhrases');
  add('slop', slopScore01, DEFAULT_WEIGHTS.slop, 'features.slop');
  add('burstiness', mapInverse(f.sentenceLengths.cv, 0.2, 0.75, 0, 1), DEFAULT_WEIGHTS.burstiness, 'features.burstiness');
  add('transitions', mapLinear(f.transitions.per100, 0.2, 3, 0, 1), DEFAULT_WEIGHTS.transitions, 'features.transitions');
  add('sentenceStarts', mapInverse(f.entropy.sentenceStart, 0.8, 2.6, 0, 1), DEFAULT_WEIGHTS.sentenceStarts, 'features.sentenceStarts');
  add('pronounVoice', mapInverse(f.style.pronounRate, 0.004, 0.05, 0, 1), DEFAULT_WEIGHTS.pronounVoice, 'features.pronounVoice');
  add('compressibility', f.compressibility.score, DEFAULT_WEIGHTS.compressibility, 'features.compressibility');
  add('repetition', mapLinear(f.repetition.trigramRepeatRate, 0.02, 0.22, 0, 1), DEFAULT_WEIGHTS.repetition, 'features.repetition');
  add('paragraphUniformity', mapInverse(f.paragraphLengths.cv, 0.15, 0.8, 0, 1), DEFAULT_WEIGHTS.paragraphUniformity, 'features.paragraphUniformity');
  add('hedges', mapLinear(f.hedges.per100, 0.05, 1.2, 0, 1), DEFAULT_WEIGHTS.hedges, 'features.hedges');
  add('contractions', mapInverse(f.style.contractionRate, 0.002, 0.03, 0, 1), DEFAULT_WEIGHTS.contractions, 'features.contractions');
  add('emDash', mapLinear(f.punctuation.emDashPer100, 0, 1.5, 0, 1), DEFAULT_WEIGHTS.emDash, 'features.emDash');
  add('lexicalSmoothness', mapInverse(f.lexical.rootTtr, 3.5, 7.5, 0, 1), DEFAULT_WEIGHTS.lexicalSmoothness, 'features.lexicalSmoothness');
  add('structuredShape', mapLinear(f.formatting.structuredRatio, 0.02, 0.4, 0, 1), DEFAULT_WEIGHTS.structuredShape, 'features.structuredShape');
  add('punctuation', mapInverse(f.punctuation.entropy, 0.8, 2.4, 0, 1), DEFAULT_WEIGHTS.punctuation, 'features.punctuation');
  add('colonDensity', mapLinear(f.punctuation.colonPer100, 0.2, 3, 0, 1), DEFAULT_WEIGHTS.colonDensity, 'features.colonDensity');
  add('lexicalVariety', mapLinear(f.lexical.typeTokenRatio, 0.45, 0.8, 0, 1), DEFAULT_WEIGHTS.lexicalVariety, 'features.lexicalVariety');

  return comp;
}

/**
 * Analyse a text.
 * @param {string} text
 * @param {{language?:string, sensitivity?:number, hints?:object, weights?:object,
 *          includeSentences?:boolean, watermark?:{keys?:number[],tokenIds?:number[],tokenizer?:Function,ngramLen?:number,greenListKey?:any}}} [options]
 */
export function detectText(text, options = {}) {
  const src = typeof text === 'string' ? text : '';
  const sensitivity = clamp(options.sensitivity ?? 1, 0.3, 2.5);
  const langResult = options.language
    ? { lang: options.language, confidence: 1, scores: [], script: null, name: options.language, uncertain: false }
    : detectLanguage(src, options.hints || {});

  const { features, sentences } = extractFeatures(src, { language: langResult.lang });
  const slop = detectSlop(src, { language: langResult.lang });
  const unicode = scanUnicode(src);

  // Watermark module: only meaningful with a key, and we say so otherwise.
  const wm = options.watermark || {};
  let watermark = { available: false, reason: 'no-key', note: WATERMARK_NOTE, verdict: 'unavailable' };
  const tokenIds = Array.isArray(wm.tokenIds) ? wm.tokenIds
    : typeof wm.tokenizer === 'function' ? safeTokens(wm.tokenizer, src) : null;
  if (tokenIds && Array.isArray(wm.keys) && wm.keys.length) {
    watermark = detectSynthid(tokenIds, wm.keys, { ngramLen: wm.ngramLen });
  } else if (tokenIds && wm.greenListKey != null) {
    watermark = detectGreenList(tokenIds, wm.greenListKey, {});
  }

  const components = computeComponents(features, slop.score / 100);

  // Specific evidence is kept out of the stylometric average: a clean text has
  // no watermark and no invisible characters, and that absence must not drag
  // the style index down. Evidence raises the score when it is present.
  const evidence = [];
  if (unicode.score > 0) {
    evidence.push({
      id: 'unicode',
      value: unicode.score,
      weight: DEFAULT_WEIGHTS.unicode,
      label: 'features.unicode',
      detail: describeUnicode(unicode),
    });
  }
  if (watermark.available) {
    evidence.push({
      id: 'watermark',
      value: watermark.verdict === 'watermarked' ? 1 : watermark.verdict === 'likely-watermarked' ? 0.8 : 0,
      weight: 3,
      label: 'features.watermark',
      detail: `z=${watermark.z}`,
    });
  }

  const weightSum = components.reduce((a, c) => a + c.weight, 0) || 1;
  const base = components.reduce((a, c) => a + c.value * c.weight, 0) / weightSum;

  const words = features.counts.words;
  const lengthConfidence = clamp(mapLinear(words, 15, 220, 0.25, 1), 0.1, 1);
  const langConfidence = clamp((langResult.confidence ?? 0.5) * 0.5 + 0.5, 0.3, 1);
  const confidence = round(lengthConfidence * langConfidence, 2);

  const calibrated = logistic((base - 0.45) * 9 * sensitivity);
  let score = Math.round(calibrated * 100);
  if (words < 25) score = Math.round(score * 0.75 + 50 * 0.25);

  // Hard overrides: a hidden payload or a detected watermark is not a matter
  // of degree.
  if (unicode.score > 0.3) score = Math.max(score, Math.round(45 + unicode.score * 45));
  if (unicode.hiddenMessage) score = Math.max(score, 95);
  if (watermark.available && watermark.verdict === 'watermarked') score = Math.max(score, 90);
  score = clamp(score, 0, 100);

  const verdict = verdictFor(score);

  const reasons = [...components, ...evidence]
    .map((c) => ({
      id: c.id,
      label: c.label,
      value: round(c.value, 3),
      weight: c.weight,
      impact: round(c.value * c.weight, 3),
      detail: c.detail || null,
    }))
    .filter((r) => r.value > 0.35)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, 7);

  const result = {
    ok: true,
    version: 2,
    score,
    verdict: verdict.id,
    verdictKey: verdict.key,
    confidence,
    language: langResult.lang,
    languageName: langResult.name,
    languageConfidence: langResult.confidence,
    languageScores: langResult.scores,
    fingerprint: fingerprint(src),
    wordCount: words,
    counts: features.counts,
    features,
    reasons,
    components,
    evidence,
    slop: { score: slop.score, findings: slop.findings, total: round(slop.total, 2) },
    aiPhrases: features.aiPhrases.hits,
    modules: {
      unicode: {
        score: unicode.score,
        findings: unicode.findings,
        invisibleCount: unicode.invisibleCount,
        hiddenMessage: unicode.hiddenMessage,
        mixedScriptTokens: unicode.mixedScriptTokens,
        confusableCount: unicode.confusableCount,
        normalizes: unicode.normalizes,
      },
      watermark,
      stylometry: { featureCount: components.length },
    },
    sentences: [],
    highlights: [],
    disclaimer:
      'Heuristic index computed locally from style, Unicode anomalies and optional watermarks. It is not proof of authorship.',
  };

  if (options.includeSentences !== false) {
    result.sentences = scoreSentences(sentences, features, score / 100, sensitivity);
    result.highlights = result.sentences
      .filter((s) => s.score >= 60)
      .map((s) => ({ start: s.start, end: s.end, score: s.score, verdict: s.verdict }));
  }

  return result;
}

function safeTokens(tokenizer, text) {
  try {
    const t = tokenizer(text);
    return Array.isArray(t) ? t.map(Number) : null;
  } catch {
    return null;
  }
}

function describeUnicode(unicode) {
  const parts = [];
  if (unicode.hiddenMessage) parts.push('hidden payload');
  for (const f of unicode.findings) parts.push(`${f.label} ×${f.count}`);
  return parts.slice(0, 4).join('; ');
}

function scoreSentences(sentences, docFeatures, docScore01, sensitivity) {
  return sentences.map((s) => {
    const lf = extractSentenceFeatures(s, docFeatures);
    const parts = [
      { v: mapLinear(lf.aiPhraseScore, 0.5, 3, 0, 1), w: 2.2 },
      { v: mapLinear(lf.hedges, 0.5, 2, 0, 1), w: 0.6 },
      { v: mapInverse(lf.lengthDeviation, 0, 2, 0, 1), w: 0.5 },
      { v: mapInverse(lf.pronounRate, 0.01, 0.06, 0, 1), w: 0.6 },
      { v: mapInverse(lf.contractionRate, 0.005, 0.05, 0, 1), w: 0.5 },
      { v: mapLinear(lf.emDash, 0, 2, 0, 1), w: 0.4 },
    ];
    const sum = parts.reduce((a, p) => a + p.w, 0);
    const local = parts.reduce((a, p) => a + p.v * p.w, 0) / sum;
    const localCal = logistic((local - 0.5) * 5 * sensitivity);
    const localWeight = lf.length < 6 ? 0.25 : 0.55;
    const blended = localWeight * localCal + (1 - localWeight) * docScore01;
    const score = Math.round(clamp(blended, 0, 1) * 100);
    const v = verdictFor(score);
    return {
      text: s.text,
      start: s.start,
      end: s.end,
      score,
      verdict: v.id,
      verdictKey: v.key,
      reasons: [
        lf.aiPhraseHits.length ? `ai-phrase:${lf.aiPhraseHits.join(', ')}` : null,
        lf.length < 6 ? 'short' : null,
        lf.pronounRate > 0.03 ? 'personal-voice' : null,
      ].filter(Boolean),
      fingerprint: fingerprint(s.text).slice(0, 8),
    };
  });
}

/**
 * Compare two texts (light near-duplicate check).
 * Uses token Jaccard plus shared 5-gram phrases.
 */
export function compareTexts(a, b) {
  const norm = (t) => tokenizeWords(String(t || '').toLowerCase()).map((w) => w.lower);
  const ta = norm(a);
  const tb = norm(b);
  const setA = new Set(ta);
  const setB = new Set(tb);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter += 1;
  const union = setA.size + setB.size - inter;
  const jaccard = union ? inter / union : 0;

  const grams = (arr, n = 5) => {
    const s = new Set();
    for (let i = 0; i + n <= arr.length; i += 1) s.add(arr.slice(i, i + n).join(' '));
    return s;
  };
  const ga = grams(ta);
  const gb = grams(tb);
  let gi = 0;
  for (const g of ga) if (gb.has(g)) gi += 1;
  const gramOverlap = Math.min(ga.size, gb.size) ? gi / Math.min(ga.size, gb.size) : 0;

  return {
    similarity: round(Math.max(jaccard, gramOverlap) * 100, 1),
    jaccard: round(jaccard, 3),
    sharedPhrases: gi,
    matchedPhrases: [...ga].filter((g) => gb.has(g)).slice(0, 25),
  };
}

export { splitSentences, tokenizeWords, countWords };
