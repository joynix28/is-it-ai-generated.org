/**
 * Tokenization utilities shared by every detector.
 *
 * Everything here is pure, dependency-free and Unicode-aware so the exact
 * same code runs in the browser, in Node, and inside a Cloudflare Worker.
 */

const WORD_RE = /[\p{L}\p{N}]+(?:['\u2019\u02BC-][\p{L}\p{N}]+)*/gu;

/** Sentence terminators across scripts. */
const TERMINATORS = new Set([
  '.', '!', '?', '\u2026', // … 
  '\u3002', // 。 CJK full stop
  '\uFF01', // ！ fullwidth !
  '\uFF1F', // ？ fullwidth ?
  '\u0964', // । Devanagari danda
  '\u0965', // ॥ double danda
  '\u061F', // ؟ Arabic question mark
  '\u0589', // ։ Armenian full stop
  '\u06D4', // ۔ Urdu full stop
]);

/** Closing punctuation that belongs to the previous sentence. */
const CLOSERS = new Set([
  '"', "'", '\u201D', '\u2019', '\u00BB', '\u203A', ')', ']', '}', '»',
  '\u300D', '\u300F', '\uFF09', '\u3011',
]);

/** Multi-dot or dotted abbreviations that should not end a sentence. */
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'eg', 'ie',
  'no', 'fig', 'figs', 'approx', 'inc', 'ltd', 'co', 'corp', 'dept', 'univ',
  'gov', 'gen', 'sen', 'rep', 'capt', 'lt', 'sgt', 'col', 'maj', 'messrs',
  'al', 'cf', 'ed', 'eds', 'vol', 'pp', 'pt', 'sec', 'art', 'op', 'cit',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
  // French / Romance
  'm', 'mm', 'mme', 'mlles', 'mlle', 'mgr', 'av', 'bd', 'env', 'ex', 'sup',
  // German
  'bzw', 'z b', 'ca', 'evtl', 'ggf', 'usw', 'vgl', 'sog', 'u a',
  // Misc
  'a m', 'p m', 'u s', 'u k',
]);

const CJK_RE = /[\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uAC00-\uD7AF]/u;

/**
 * Split text into sentences while tracking offsets in the original string.
 * @param {string} text
 * @returns {{text: string, start: number, end: number}[]}
 */
export function splitSentences(text) {
  const out = [];
  if (!text) return out;
  const n = text.length;
  let start = 0;
  let i = 0;

  const push = (from, to) => {
    const raw = text.slice(from, to);
    const lead = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (!trimmed) return;
    out.push({ text: trimmed, start: from + lead, end: from + lead + trimmed.length });
  };

  while (i < n) {
    const ch = text[i];
    if (!TERMINATORS.has(ch)) {
      i += 1;
      continue;
    }

    // Decimal numbers: 3.14 / 1,5 -> keep together (only '.' relevant here).
    if (ch === '.' && /\d/.test(text[i - 1] || '') && /\d/.test(text[i + 1] || '')) {
      i += 1;
      continue;
    }

    // Abbreviations and dotted forms: "Dr." / "e.g." / "U.S." / "p.m." / "J. Smith".
    if (ch === '.') {
      const next = text[i + 1] || '';
      // A lowercase letter right after the dot (no space) means it is not a
      // sentence end: p.m., e.g., i.e., u.s.
      if (next && !/\s/.test(next) && /\p{Ll}/u.test(next)) {
        i += 1;
        continue;
      }
      const beforeTrim = text.slice(start, i).replace(/\s+$/, '');
      const lastWord = (beforeTrim.match(/[\p{L}]+$/u) || [''])[0].toLowerCase();
      const compact = text.slice(start, i).replace(/\s+/g, ' ').trimEnd().slice(-6).toLowerCase();
      const singleLetter = /\b\p{L}$/u.test(beforeTrim);
      if (singleLetter || ABBREVIATIONS.has(lastWord) || ABBREVIATIONS.has(compact)) {
        i += 1;
        continue;
      }
    }

    let j = i + 1;
    // Absorb repeated terminators: "?!" "..." "..."
    while (j < n && (TERMINATORS.has(text[j]) || text[j] === '.')) j += 1;
    // Absorb closing quotes / brackets.
    while (j < n && CLOSERS.has(text[j])) j += 1;

    push(start, j);
    start = j;
    i = j;
  }

  if (start < n) push(start, n);
  return out;
}

/**
 * Extract words with offsets and lowercase forms.
 * @param {string} text
 * @returns {{word: string, lower: string, start: number, end: number}[]}
 */
export function tokenizeWords(text) {
  const out = [];
  if (!text) return out;
  WORD_RE.lastIndex = 0;
  let m;
  while ((m = WORD_RE.exec(text)) !== null) {
    out.push({
      word: m[0],
      lower: m[0].toLowerCase(),
      start: m.index,
      end: m.index + m[0].length,
    });
  }
  return out;
}

/**
 * Count "words" the way a word processor does. For CJK scripts each
 * ideograph/kana/hangul syllable counts as one word, matching common
 * conventions used by Word and Google Docs.
 * @param {string} text
 */
export function countWords(text) {
  if (!text) return 0;
  let count = 0;
  WORD_RE.lastIndex = 0;
  let m;
  while ((m = WORD_RE.exec(text)) !== null) {
    const w = m[0];
    if (CJK_RE.test(w)) {
      let cjk = 0;
      for (const c of w) if (CJK_RE.test(c)) cjk += 1;
      count += cjk + (w.length - cjk > 0 ? 1 : 0);
    } else {
      count += 1;
    }
  }
  return count;
}

/** @param {string} text */
export function splitParagraphs(text) {
  if (!text) return [];
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** @param {string} text */
export function hasCJK(text) {
  return CJK_RE.test(text || '');
}

export { WORD_RE, TERMINATORS, ABBREVIATIONS };
