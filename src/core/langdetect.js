/**
 * Dependency-free language identifier.
 *
 * Strategy: script detection first (cheap and decisive for non-Latin scripts),
 * then function-word overlap for Latin/Cyrillic languages, then optional hints
 * from the device (navigator.language), Accept-Language and referrer.
 *
 * It supports around 60 languages. It is intentionally small: a few hundred
 * bytes per language instead of a multi-megabyte model.
 */

import { STOPWORDS, CHAR_HINTS, CYRILLIC_HINTS, SCRIPTS, CYRILLIC_LANGS, LANGUAGE_NAMES } from './lexicons.js';
import { tokenizeWords } from './tokenize.js';

const MAX_SAMPLE = 6000;

/** Fold accents/case so "cómo" == "como", "İ" == "i", "ß" == "ss". */
export function fold(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .replace(/ø/g, 'o')
    .replace(/đ/g, 'd')
    .replace(/ł/g, 'l')
    .replace(/ı/g, 'i')
    .replace(/[şș]/g, 's')
    .replace(/[ğ]/g, 'g')
    .replace(/[țţ]/g, 't')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/** Folded stopword sets per language, built once. */
const FOLDED = new Map();
for (const [lang, list] of Object.entries(STOPWORDS)) {
  FOLDED.set(lang, new Set(list.map(fold)));
}

/**
 * Inverse document frequency across language lists: a function word shared by
 * ten languages (de, la, que) is weak evidence; one unique to a language is
 * strong. This is what stops Spanish being confused with French.
 */
const DF = new Map();
for (const set of FOLDED.values()) {
  for (const w of set) DF.set(w, (DF.get(w) || 0) + 1);
}
const NLANG = FOLDED.size;
const idf = (w) => Math.log(1 + NLANG / (DF.get(w) || 1));

/**
 * Tiny prior toward higher-resource languages. Without it, very close pairs
 * (Galician/Spanish, Afrikaans/Dutch, Czech/Slovak) swap on short inputs.
 * The value is intentionally small: real function-word evidence still wins.
 */
const RESOURCE_PRIOR = {
  en: 0.08, es: 0.06, fr: 0.06, de: 0.06, zh: 0.06, ru: 0.06,
  pt: 0.05, it: 0.05, ja: 0.05, ar: 0.04, hi: 0.04,
  nl: 0.03, pl: 0.03, tr: 0.03, ko: 0.03, uk: 0.02, sv: 0.02,
  id: 0.02, vi: 0.02, cs: 0.02, ro: 0.02, el: 0.02, fa: 0.02,
};
const prior = (lang) => RESOURCE_PRIOR[lang] || 0;



/** Unicode ranges used for the script histogram. */
const LETTER_RE = /[\p{L}]/u;

/**
 * @typedef {{lang:string, confidence:number, scores:{lang:string,score:number}[], script:string|null, source?:string}} LangResult
 */

/**
 * Detect the dominant language of a text.
 * @param {string} text
 * @param {{deviceLanguages?:string[], acceptLanguage?:string, referer?:string}} [hints]
 * @returns {LangResult}
 */
export function detectLanguage(text, hints = {}) {
  const src = (text || '').slice(0, MAX_SAMPLE);
  // Split on hyphens and apostrophes too, so "allez-vous" and "c'est" yield
  // the function words "vous", "ce" and "est".
  const tokens = [];
  for (const w of tokenizeWords(src)) {
    for (const part of w.lower.split(/['\u2019\u02BC-]+/)) {
      if (part) tokens.push(fold(part));
    }
  }
  const tokenFreq = new Map();
  for (const t of tokens) tokenFreq.set(t, (tokenFreq.get(t) || 0) + 1);

  const scores = new Map();

  // 1. Script histogram.
  const scriptCounts = new Map();
  let letters = 0;
  for (const ch of src) {
    if (!LETTER_RE.test(ch)) continue;
    letters += 1;
    for (const s of SCRIPTS) {
      if (s.re.test(ch)) {
        scriptCounts.set(s.name, (scriptCounts.get(s.name) || 0) + 1);
        break;
      }
    }
  }

  let dominantScript = null;
  let dominantCount = 0;
  for (const [name, count] of scriptCounts) {
    if (count > dominantCount) {
      dominantCount = count;
      dominantScript = name;
    }
  }
  const scriptShare = letters ? dominantCount / letters : 0;

  if (dominantScript && scriptShare > 0.25) {
    const entry = SCRIPTS.find((s) => s.name === dominantScript);
    if (entry && entry.lang && dominantScript !== 'Devanagari' && dominantScript !== 'Arabic' && dominantScript !== 'Han' && dominantScript !== 'Cyrillic') {
      // Unambiguous scripts: hiragana/katakana -> ja, hangul -> ko, thai -> th …
      scores.set(entry.lang, 1);
    } else if (dominantScript === 'Han') {
      // Japanese mixes kana with Han; pure Han is usually Chinese.
      const kana = (scriptCounts.get('Hiragana') || 0) + (scriptCounts.get('Katakana') || 0);
      if (kana > 0) {
        scores.set('ja', 1 - kana / (kana + dominantCount));
        scores.set('ja', 1);
        scores.set('zh', 0.15);
      } else {
        scores.set('zh', 1);
        scores.set('ja', 0.1);
      }
    } else if (dominantScript === 'Devanagari') {
      addStopwordScores(src, tokenFreq, ['hi', 'mr', 'ne'], scores);
    } else if (dominantScript === 'Arabic') {
      addStopwordScores(src, tokenFreq, ['ar', 'fa', 'ur'], scores);
    } else if (dominantScript === 'Cyrillic') {
      addStopwordScores(src, tokenFreq, CYRILLIC_LANGS, scores);
    }

    // Still let hints nudge the result.
    applyHints(hints, scores, 0.35);
    return finalize(scores, dominantScript, hints);
  }

  // 2. Latin (and other) languages via function words + diacritics.
  const latin = Object.keys(STOPWORDS).filter(
    (l) => !['zh', 'ja', 'ko', 'hi', 'mr', 'ne', 'bn', 'pa', 'gu', 'ta', 'te', 'kn', 'ml', 'th', 'lo', 'km', 'my', 'si', 'am', 'ar', 'fa', 'ur', 'he'].includes(l),
  );
  const tokenTotal = Math.max(1, tokens.length);
  for (const lang of latin) {
    const set = FOLDED.get(lang);
    if (!set) continue;
    let matchedIdf = 0;
    let matchedCount = 0;
    let tokenHits = 0;
    for (const [w, c] of tokenFreq) {
      if (set.has(w)) {
        matchedIdf += Math.min(idf(w), 2.5);
        matchedCount += 1;
        tokenHits += c;
      }
    }
    if (!matchedCount) continue;
    // Denominator depends on the text, not the list length, so small lists
    // do not win just by being small.
    const denom = Math.sqrt(Math.max(1, Math.min(set.size, tokenTotal)));
    const evidence = matchedCount / (matchedCount + 1.2);
    let total = (matchedIdf / denom) * evidence * 1.6;
    total += Math.min(tokenHits / tokenTotal, 0.8) * 0.5;
    const hint = CHAR_HINTS[lang];
    if (hint && hint.test(src)) total += 0.15;
    scores.set(lang, total + prior(lang));
  }

  applyHints(hints, scores, 0.25);
  return finalize(scores, dominantScript, hints);
}

function addStopwordScores(src, tokenFreq, langs, scores) {
  const tokenTotal = Math.max(1, [...tokenFreq.values()].reduce((a, b) => a + b, 0));
  for (const lang of langs) {
    const set = FOLDED.get(lang);
    if (!set) continue;
    let matchedIdf = 0;
    let matchedCount = 0;
    for (const w of tokenFreq.keys()) {
      if (set.has(w)) {
        matchedIdf += Math.min(idf(w), 2.5);
        matchedCount += 1;
      }
    }
    const denom = Math.sqrt(Math.max(1, Math.min(set.size, tokenTotal)));
    const evidence = matchedCount / (matchedCount + 1.2);
    let score = (matchedIdf / denom) * evidence * 1.6;
    const hint = CHAR_HINTS[lang] || CYRILLIC_HINTS[lang];
    if (hint && hint.test(src)) score += 0.3;
    scores.set(lang, score + prior(lang));
  }
}

/** Nudge scores using device / header / referrer hints. */
function applyHints(hints, scores, strength) {
  const hintLangs = new Set();
  for (const l of hints.deviceLanguages || []) hintLangs.add(String(l).split('-')[0].toLowerCase());
  if (hints.acceptLanguage) {
    for (const part of hints.acceptLanguage.split(',')) {
      const code = part.trim().split(';')[0].split('-')[0].toLowerCase();
      if (code) hintLangs.add(code);
    }
  }
  if (hints.referer) {
    const m = /\.([a-z]{2})(?:[/:]|$)/i.exec(String(hints.referer));
    if (m) hintLangs.add(m[1].toLowerCase());
  }
  if (!hintLangs.size) return;
  const max = Math.max(0.001, ...scores.values());
  for (const l of hintLangs) {
    if (STOPWORDS[l] || LANGUAGE_NAMES[l]) {
      scores.set(l, (scores.get(l) || 0) + max * strength);
    }
  }
}

function finalize(scores, script, hints) {
  let entries = [...scores.entries()].map(([lang, score]) => ({ lang, score }));
  entries.sort((a, b) => b.score - a.score);

  if (!entries.length) {
    const fallback = firstHint(hints) || 'en';
    return {
      lang: fallback,
      confidence: 0.1,
      scores: [{ lang: fallback, score: 0.1 }],
      script,
      name: LANGUAGE_NAMES[fallback] || fallback,
      uncertain: true,
    };
  }

  const top = entries.slice(0, 6);
  const sum = top.reduce((a, b) => a + b.score, 0);
  let confidence;
  if (sum === 0) {
    // Script is known but no function words matched: a weak, flagged guess.
    confidence = 0.15;
  } else {
    confidence = Math.min(0.99, top[0].score / sum + (top[1] ? (top[0].score - top[1].score) / sum : 0.5));
  }
  return {
    lang: top[0].lang,
    confidence: Math.round(confidence * 100) / 100,
    scores: top.map((e) => ({ lang: e.lang, score: Math.round(e.score * 1000) / 1000 })),
    script,
    name: LANGUAGE_NAMES[top[0].lang] || top[0].lang,
    uncertain: confidence < 0.35,
  };
}

function firstHint(hints) {
  if (hints.deviceLanguages && hints.deviceLanguages.length) {
    return String(hints.deviceLanguages[0]).split('-')[0].toLowerCase();
  }
  if (hints.acceptLanguage) {
    return hints.acceptLanguage.split(',')[0].split(';')[0].split('-')[0].toLowerCase();
  }
  return null;
}

/** True when the language is written right-to-left. */
export function isRTL(lang) {
  return RTL_CHECK.has(lang);
}
const RTL_CHECK = new Set(['ar', 'he', 'fa', 'ur', 'yi', 'dv', 'ps', 'sd', 'ug']);

export { LANGUAGE_NAMES };
