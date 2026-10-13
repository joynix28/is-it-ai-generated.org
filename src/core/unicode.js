/**
 * Unicode forensics.
 *
 * Invisible and confusable characters are used to smuggle hidden payloads in
 * text (prompt injection, "AI tells" left by tools, evasion of filters) and to
 * spoof words with lookalike letters. This module finds them, decodes any
 * hidden ASCII smuggled through Unicode tag characters, and reports a 0..1
 * machine-likelihood contribution.
 *
 * No network, no dependencies.
 */

/** Invisible / zero-width / formatting characters. */
export const INVISIBLE_RANGES = [
  { from: 0x00ad, to: 0x00ad, id: 'soft-hyphen', label: 'Soft hyphen' },
  { from: 0x034f, to: 0x034f, id: 'cgj', label: 'Combining grapheme joiner' },
  { from: 0x061c, to: 0x061c, id: 'alm', label: 'Arabic letter mark' },
  { from: 0x115f, to: 0x1160, id: 'hangul-filler', label: 'Hangul filler' },
  { from: 0x17b4, to: 0x17b5, id: 'khmer-inherent', label: 'Khmer inherent vowel' },
  { from: 0x180e, to: 0x180e, id: 'mongolian-vs', label: 'Mongolian vowel separator' },
  { from: 0x200b, to: 0x200f, id: 'zero-width', label: 'Zero-width / directional mark' },
  { from: 0x202a, to: 0x202e, id: 'bidi-embed', label: 'Bidi embedding control' },
  { from: 0x2060, to: 0x2064, id: 'word-joiner', label: 'Invisible operator' },
  { from: 0x2066, to: 0x206f, id: 'bidi-isolate', label: 'Bidi isolate / invisible' },
  { from: 0x3164, to: 0x3164, id: 'hangul-filler-hw', label: 'Hangul filler (halfwidth)' },
  { from: 0xfeff, to: 0xfeff, id: 'bom', label: 'Byte order mark / zero-width no-break' },
  { from: 0xffa0, to: 0xffa0, id: 'hangul-filler-hw2', label: 'Hangul filler (halfwidth)' },
  { from: 0x2028, to: 0x2029, id: 'line-sep', label: 'Line / paragraph separator' },
];

/** Unicode tag characters: invisible ASCII smuggling (U+E0000-U+E007F). */
const TAG_FROM = 0xe0000;
const TAG_TO = 0xe007f;

/** Variation selectors. */
const VS_FROM = 0xfe00;
const VS_TO = 0xfe0f;
const VS_SUPP_FROM = 0xe0100;
const VS_SUPP_TO = 0xe01ef;

/** Non-ASCII spaces that can hide in copy-pasted text. */
export const EXOTIC_SPACES = [
  { from: 0x00a0, to: 0x00a0, label: 'No-break space' },
  { from: 0x1680, to: 0x1680, label: 'Ogham space mark' },
  { from: 0x2000, to: 0x200a, label: 'Unicode space' },
  { from: 0x202f, to: 0x202f, label: 'Narrow no-break space' },
  { from: 0x205f, to: 0x205f, label: 'Medium mathematical space' },
  { from: 0x3000, to: 0x3000, label: 'Ideographic space' },
];

/** Confusable characters mapped to their Latin skeleton. */
const CONFUSABLES = new Map(Object.entries({
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'у': 'y',
  'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'һ': 'h', 'ӏ': 'l', 'ь': 'b',
  'А': 'A', 'В': 'B', 'Е': 'E', 'З': '3', 'К': 'K', 'М': 'M', 'Н': 'H',
  'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'У': 'Y', 'Х': 'X',
  'α': 'a', 'ο': 'o', 'ε': 'e', 'ρ': 'p', 'ν': 'v', 'τ': 't', 'υ': 'u',
  'ι': 'i', 'κ': 'k', 'μ': 'm', 'χ': 'x', 'Α': 'A', 'Β': 'B', 'Ε': 'E',
  'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Χ': 'X', 'Η': 'H', 'Μ': 'M', 'Ν': 'N',
  'ⅼ': 'l', 'Ｉ': 'I', 'ɡ': 'g', 'ƅ': 'b', 'ⅰ': 'i',
}));

const LETTER = /\p{L}/u;
const SCRIPT_TESTS = [
  { name: 'Latin', re: /\p{Script=Latin}/u },
  { name: 'Cyrillic', re: /\p{Script=Cyrillic}/u },
  { name: 'Greek', re: /\p{Script=Greek}/u },
  { name: 'Arabic', re: /\p{Script=Arabic}/u },
  { name: 'Hebrew', re: /\p{Script=Hebrew}/u },
  { name: 'Han', re: /\p{Script=Han}/u },
  { name: 'Hiragana', re: /\p{Script=Hiragana}/u },
  { name: 'Katakana', re: /\p{Script=Katakana}/u },
  { name: 'Hangul', re: /\p{Script=Hangul}/u },
  { name: 'Devanagari', re: /\p{Script=Devanagari}/u },
  { name: 'Thai', re: /\p{Script=Thai}/u },
];

function rangeLabel(cp, ranges) {
  for (const r of ranges) if (cp >= r.from && cp <= r.to) return r;
  return null;
}

/** Decode a hidden ASCII message smuggled via Unicode tag characters. */
export function decodeTagPayload(text) {
  let out = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp >= TAG_FROM && cp <= TAG_TO) {
      const ascii = cp - TAG_FROM;
      if (ascii >= 32 && ascii < 127) out += String.fromCharCode(ascii);
    }
  }
  return out;
}

/**
 * Full Unicode scan.
 * @param {string} text
 * @returns {{findings:Array, score:number, hiddenMessage:string|null, scripts:Object, mixedScriptTokens:Array, normalizes:boolean}}
 */
export function scanUnicode(text) {
  const src = text || '';
  const findings = [];
  const positions = new Map(); // id -> {label, count, sample:[]}
  const add = (id, label, index, char) => {
    if (!positions.has(id)) positions.set(id, { id, label, count: 0, sample: [], positions: [] });
    const f = positions.get(id);
    f.count += 1;
    if (f.sample.length < 8) f.sample.push({ index, char, code: `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}` });
    if (f.positions.length < 40) f.positions.push(index);
  };

  let invisible = 0;
  let index = 0;
  for (const ch of src) {
    const cp = ch.codePointAt(0);
    const inv = rangeLabel(cp, INVISIBLE_RANGES);
    if (inv) {
      invisible += 1;
      add(inv.id, inv.label, index, ch);
    } else if (cp >= TAG_FROM && cp <= TAG_TO) {
      invisible += 1;
      add('unicode-tags', 'Unicode tag character (hidden payload)', index, ch);
    } else if ((cp >= VS_FROM && cp <= VS_TO) || (cp >= VS_SUPP_FROM && cp <= VS_SUPP_TO)) {
      invisible += 1;
      add('variation-selector', 'Variation selector', index, ch);
    } else {
      for (const sp of EXOTIC_SPACES) {
        if (cp >= sp.from && cp <= sp.to) { add('exotic-space', sp.label, index, ch); break; }
      }
    }
    index += ch.length;
  }

  for (const f of positions.values()) {
    const severity = f.id === 'unicode-tags' ? 'high' : 'low';
    findings.push({ ...f, severity });
  }

  // Homoglyphs: normalize, then compare, then look for mixed script within a word.
  const normalized = src.normalize('NFKC');
  const normalizes = normalized === src;
  const mixedScriptTokens = [];
  let confusableCount = 0;
  const words = src.match(/[\p{L}\p{N}]+/gu) || [];
  for (const w of words) {
    const scripts = new Set();
    let skeleton = '';
    let changed = false;
    for (const ch of w) {
      if (LETTER.test(ch)) {
        for (const s of SCRIPT_TESTS) if (s.re.test(ch)) { scripts.add(s.name); break; }
      }
      const mapped = CONFUSABLES.get(ch);
      if (mapped) { skeleton += mapped; changed = true; } else skeleton += ch;
    }
    if (scripts.size > 1 && (scripts.has('Latin') || scripts.has('Cyrillic') || scripts.has('Greek'))) {
      mixedScriptTokens.push({ token: w, scripts: [...scripts] });
    }
    if (changed && /[a-z]/i.test(skeleton) && skeleton !== w) confusableCount += 1;
  }
  if (mixedScriptTokens.length) {
    findings.push({
      id: 'mixed-script',
      label: 'Mixed-script token (possible homoglyph)',
      count: mixedScriptTokens.length,
      severity: 'medium',
      sample: mixedScriptTokens.slice(0, 8),
      positions: [],
    });
  }
  if (confusableCount) {
    findings.push({
      id: 'confusable',
      label: 'Confusable characters',
      count: confusableCount,
      severity: 'medium',
      sample: [],
      positions: [],
    });
  }
  if (!normalizes && normalized.length === src.length) {
    findings.push({
      id: 'compatibility',
      label: 'Compatibility characters (fullwidth / math alphanumerics)',
      count: 1,
      severity: 'low',
      sample: [],
      positions: [],
    });
  }

  const hiddenMessage = decodeTagPayload(src) || null;

  // Score: invisible density plus the presence of structural anomalies.
  const len = Math.max(1, src.length);
  const invisibleRatio = invisible / len;
  let score = Math.min(1, invisibleRatio * 120);
  if (hiddenMessage) score = 1;
  if (findings.some((f) => f.id === 'mixed-script')) score = Math.max(score, 0.55);
  if (findings.some((f) => f.id === 'unicode-tags')) score = 1;

  return {
    findings,
    score: Math.round(Math.min(1, score) * 100) / 100,
    invisibleCount: invisible,
    hiddenMessage,
    normalizes,
    mixedScriptTokens,
    confusableCount,
  };
}
