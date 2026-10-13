/**
 * Stylometric feature extraction.
 *
 * These are the measurable signals behind the AI index. None of them proves
 * authorship on its own; together they describe how "even", "formulaic" and
 * "connectived" a text is compared to typical human writing.
 */

import { splitSentences, tokenizeWords, splitParagraphs, countWords } from './tokenize.js';
import { STOPWORDS, AI_PHRASES, TRANSITIONS, HEDGES, PERSONAL_PRONOUNS } from './lexicons.js';
import { mean, std, cv, entropy, correlation } from './math.js';

const AI_PHRASE_RE = AI_PHRASES.map((e) => ({ ...e, re: new RegExp(escapeRe(e.p), 'gi') }));
const HEDGE_RE = HEDGES.map((h) => new RegExp(escapeRe(h), 'gi'));
const TRANSITION_SET = new Set(TRANSITIONS.map((t) => t.toLowerCase()));

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countMatches(text, list) {
  let n = 0;
  const hits = [];
  for (const { p, w, re } of list) {
    re.lastIndex = 0;
    const m = text.match(re);
    if (m) {
      n += m.length * w;
      hits.push({ phrase: p, count: m.length, weight: w });
    }
  }
  return { score: n, hits };
}

/** Repeated n-gram ratio: how often 3-grams repeat within a text. */
function repeatedNgramRate(tokens, n = 3) {
  if (tokens.length < n * 2) return 0;
  const seen = new Map();
  let repeats = 0;
  for (let i = 0; i + n <= tokens.length; i += 1) {
    const key = tokens.slice(i, i + n).join(' ');
    const c = (seen.get(key) || 0) + 1;
    seen.set(key, c);
    if (c === 2) repeats += 1;
  }
  const total = tokens.length - n + 1;
  return total > 0 ? repeats / total : 0;
}

/** Shannon entropy of sentence opening words. */
function sentenceStartEntropy(sentences) {
  const firsts = [];
  for (const s of sentences) {
    const w = tokenizeWords(s.text)[0];
    if (w) firsts.push(w.lower);
  }
  if (firsts.length < 2) return 0;
  const counts = new Map();
  for (const w of firsts) counts.set(w, (counts.get(w) || 0) + 1);
  return entropy([...counts.values()]);
}

/** Entropy over the punctuation profile. */
function punctuationEntropy(text) {
  const counts = { '.': 0, ',': 0, ';': 0, ':': 0, '!': 0, '?': 0, "'": 0, '"': 0, '(': 0, ')': 0, '-': 0 };
  for (const ch of text) if (ch in counts) counts[ch] += 1;
  return entropy(Object.values(counts));
}

/**
 * Extract document-level features.
 * @param {string} text
 * @param {{language?:string}} [opts]
 */
export function extractFeatures(text, opts = {}) {
  const src = text || '';
  const lang = opts.language || 'en';
  const sentences = splitSentences(src);
  const words = tokenizeWords(src);
  const paragraphs = splitParagraphs(src);
  const tokens = words.map((w) => w.lower);
  const wordCount = countWords(src);
  const sentenceLengths = sentences.map((s) => countWords(s.text)).filter((n) => n > 0);
  const paraLengths = paragraphs.map((p) => countWords(p)).filter((n) => n > 0);

  const stopSet = new Set((STOPWORDS[lang] || STOPWORDS.en).slice(0, 100));
  const pronounSet = new Set(PERSONAL_PRONOUNS);

  let stopwordHits = 0;
  let pronounHits = 0;
  let apostropheWords = 0;
  let longWords = 0;
  let unique = new Set();
  for (const w of tokens) {
    if (stopSet.has(w)) stopwordHits += 1;
    if (pronounSet.has(w)) pronounHits += 1;
    if (w.includes("'") || w.includes('\u2019')) apostropheWords += 1;
    if (w.length >= 7) longWords += 1;
    unique.add(w);
  }

  const denom = Math.max(1, tokens.length);
  const per100 = (n) => (n / denom) * 100;

  const aiPhrase = countMatches(src, AI_PHRASE_RE);
  let transitionHits = 0;
  for (const s of sentences) {
    const first = s.text.trim().toLowerCase();
    for (const t of TRANSITION_SET) {
      if (first.startsWith(t)) {
        transitionHits += 1;
        break;
      }
    }
  }
  let hedgeHits = 0;
  for (const re of HEDGE_RE) {
    re.lastIndex = 0;
    const m = src.match(re);
    if (m) hedgeHits += m.length;
  }

  const emDashes = (src.match(/\u2014/g) || []).length;
  const semicolons = (src.match(/;/g) || []).length;
  const commas = (src.match(/,/g) || []).length;
  const questions = (src.match(/[?\uFF1F]/g) || []).length;
  const exclamations = (src.match(/[!\uFF01]/g) || []).length;
  const emoji = (src.match(/\p{Extended_Pictographic}/gu) || []).length;
  const listLines = (src.match(/^\s*(?:[-*•]|\d+[.)])\s+/gm) || []).length;

  const burstiness = cv(sentenceLengths);
  const ttr = unique.size / denom;

  const features = {
    language: lang,
    counts: {
      characters: src.length,
      charactersNoSpaces: src.replace(/\s/g, '').length,
      words: wordCount,
      sentences: sentences.length,
      paragraphs: paragraphs.length,
      uniqueWords: unique.size,
      longWords,
    },
    sentenceLengths: {
      mean: mean(sentenceLengths),
      std: std(sentenceLengths),
      min: sentenceLengths.length ? Math.min(...sentenceLengths) : 0,
      max: sentenceLengths.length ? Math.max(...sentenceLengths) : 0,
      cv: burstiness,
      values: sentenceLengths,
    },
    paragraphLengths: {
      mean: mean(paraLengths),
      std: std(paraLengths),
      cv: cv(paraLengths),
    },
    lexical: {
      typeTokenRatio: ttr,
      longWordRatio: longWords / denom,
    },
    style: {
      stopwordRate: stopwordHits / denom,
      pronounRate: pronounHits / denom,
      contractionRate: apostropheWords / denom,
    },
    punctuation: {
      emDashPer100: per100(emDashes),
      semicolonPer100: per100(semicolons),
      commaPer100: per100(commas),
      questionPer100: per100(questions),
      exclamationPer100: per100(exclamations),
      emojiPer100: per100(emoji),
      entropy: punctuationEntropy(src),
    },
    repetition: {
      trigramRepeatRate: repeatedNgramRate(tokens, 3),
      bigramRepeatRate: repeatedNgramRate(tokens, 2),
    },
    entropy: {
      sentenceStart: sentenceStartEntropy(sentences),
    },
    aiPhrases: {
      densityPer100: per100(aiPhrase.score),
      hits: aiPhrase.hits,
    },
    transitions: { per100: per100(transitionHits) },
    hedges: { per100: per100(hedgeHits) },
    formatting: {
      listLineRatio: listLines / Math.max(1, paragraphs.length + listLines),
    },
  };

  // Correlation between sentence position and sentence length. Human prose
  // often varies; generated prose tends to stay flat.
  const positions = sentenceLengths.map((_, i) => i);
  features.sequence = {
    lengthPositionCorrelation: sentences.length > 4 ? correlation(positions, sentenceLengths) : 0,
  };

  return { features, sentences, words, paragraphs };
}

/**
 * Local features for a single sentence, used for highlighting.
 * @param {{text:string}} sentence
 * @param {object} docFeatures
 */
export function extractSentenceFeatures(sentence, docFeatures) {
  const text = sentence.text || '';
  const words = tokenizeWords(text);
  const tokens = words.map((w) => w.lower);
  const len = countWords(text);
  const unique = new Set(tokens).size;
  const aiPhrase = countMatches(text, AI_PHRASE_RE);
  let hedges = 0;
  for (const re of HEDGE_RE) {
    re.lastIndex = 0;
    const m = text.match(re);
    if (m) hedges += m.length;
  }
  const pronouns = tokens.filter((t) => PERSONAL_PRONOUNS.includes(t)).length;
  const contractions = tokens.filter((t) => t.includes("'") || t.includes('\u2019')).length;
  const emDash = (text.match(/\u2014/g) || []).length;

  return {
    length: len,
    uniqueRatio: tokens.length ? unique / tokens.length : 0,
    aiPhraseScore: aiPhrase.score,
    aiPhraseHits: aiPhrase.hits.map((h) => h.phrase),
    hedges,
    pronounRate: tokens.length ? pronouns / tokens.length : 0,
    contractionRate: tokens.length ? contractions / tokens.length : 0,
    emDash,
    lengthDeviation: docFeatures.sentenceLengths.std
      ? Math.abs(len - docFeatures.sentenceLengths.mean) / docFeatures.sentenceLengths.std
      : 0,
  };
}
