/**
 * Word counter / text statistics toolkit.
 *
 * Counts words, characters, sentences, paragraphs, syllables, reading and
 * speaking time, keyword density and readability. Language-aware enough to
 * handle CJK word counting and stopword filtering.
 */

import { splitSentences, tokenizeWords, splitParagraphs, countWords, hasCJK } from './tokenize.js';
import { STOPWORDS } from './lexicons.js';
import { detectLanguage } from './langdetect.js';
import { round } from './math.js';

/** Rough syllable estimate. Reasonable for readability heuristics, not phonetics. */
export function estimateSyllables(word, lang = 'en') {
  const w = String(word || '').toLowerCase();
  if (!w) return 0;
  if (hasCJK(w)) return 1;
  let s = w.replace(/[^a-zà-ÿ\u0400-\u04ff]/g, '');
  if (!s) return 1;
  if (s.length <= 3) return 1;
  s = s.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  s = s.replace(/^y/, '');
  const groups = s.match(/[aeiouyà-ÿа-яё]{1,3}/g);
  let n = groups ? groups.length : 1;
  // Diphthongs are common in French/German: soften the count a touch.
  if (['fr', 'de', 'nl', 'es', 'it', 'pt'].includes(lang)) n = Math.max(1, Math.round(n * 0.85));
  return Math.max(1, n);
}

const READING_WPM = { default: 220, cjk: 400 };
const SPEAKING_WPM = { default: 140, cjk: 260 };

/**
 * @param {string} text
 * @param {{language?:string, topKeywords?:number}} [options]
 */
export function countText(text, options = {}) {
  const src = typeof text === 'string' ? text : '';
  const lang = options.language || detectLanguage(src, options.hints || {}).lang;
  const words = tokenizeWords(src);
  const sentences = splitSentences(src);
  const paragraphs = splitParagraphs(src);
  const wordCount = countWords(src);
  const cjk = hasCJK(src);

  const tokens = words.map((w) => w.lower);
  let syllables = 0;
  let longWords = 0;
  for (const w of words) {
    syllables += estimateSyllables(w.word, lang);
    if (w.word.length >= 7) longWords += 1;
  }

  const stopSet = new Set((STOPWORDS[lang] || STOPWORDS.en).slice(0, 120));
  const freq = new Map();
  for (const t of tokens) {
    if (t.length < 2 || stopSet.has(t)) continue;
    freq.set(t, (freq.get(t) || 0) + 1);
  }
  const topN = options.topKeywords ?? 15;
  const keywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count, density: round((count / Math.max(1, wordCount)) * 100, 2) }));

  // Top bigrams and trigrams.
  const ngrams = (n) => {
    const m = new Map();
    for (let i = 0; i + n <= tokens.length; i += 1) {
      const gram = tokens.slice(i, i + n);
      if (gram.some((t) => stopSet.has(t))) continue;
      const key = gram.join(' ');
      m.set(key, (m.get(key) || 0) + 1);
    }
    return [...m.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([phrase, count]) => ({ phrase, count }));
  };

  const readWpm = cjk ? READING_WPM.cjk : READING_WPM.default;
  const speakWpm = cjk ? SPEAKING_WPM.cjk : SPEAKING_WPM.default;

  const wordsPerSentence = sentences.length ? wordCount / sentences.length : 0;
  const syllablesPerWord = wordCount ? syllables / wordCount : 0;
  // Flesch Reading Ease is calibrated for English; expose it but flag others.
  const fleschReadingEase = round(206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord, 1);
  const fleschKincaid = round(0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59, 1);
  const gunningFog = round(0.4 * (wordsPerSentence + 100 * (longWords / Math.max(1, wordCount))), 1);

  return {
    ok: true,
    language: lang,
    characters: src.length,
    charactersNoSpaces: src.replace(/\s/g, '').length,
    letters: (src.match(/\p{L}/gu) || []).length,
    digits: (src.match(/\p{N}/gu) || []).length,
    punctuation: (src.match(/[\p{P}\p{S}]/gu) || []).length,
    words: wordCount,
    uniqueWords: new Set(tokens).size,
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    lines: src ? src.split(/\n/).length : 0,
    syllables,
    longWords,
    avgWordLength: round(tokens.length ? tokens.reduce((a, w) => a + w.length, 0) / tokens.length : 0, 2),
    avgSentenceLength: round(wordsPerSentence, 1),
    avgSyllablesPerWord: round(syllablesPerWord, 2),
    readingTimeSeconds: Math.round((wordCount / readWpm) * 60),
    speakingTimeSeconds: Math.round((wordCount / speakWpm) * 60),
    readingTime: formatDuration((wordCount / readWpm) * 60),
    speakingTime: formatDuration((wordCount / speakWpm) * 60),
    keywords,
    bigrams: ngrams(2),
    trigrams: ngrams(3),
    readability: {
      fleschReadingEase,
      fleschKincaidGrade: fleschKincaid,
      gunningFog,
      languageSupported: lang === 'en',
    },
  };
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}s`;
  return `${m}m ${String(r).padStart(2, '0')}s`;
}

export { countWords };
