/**
 * Forensic character analysis.
 *
 * Two families of trick are used to slip text past detectors and plagiarism
 * checks:
 *   1. Invisible characters injected between letters (zero-width space, word
 *      joiner, BOM, soft hyphen, tag characters) which break tokenisation.
 *   2. Homoglyphs: Cyrillic or Greek letters that look like Latin ones, so a
 *      word reads the same to a human but hashes differently.
 *
 * Neither is normal in human prose, so their presence is strong evidence of
 * deliberate evasion. Every character is reported with its code point.
 */

import type { ForensicsResult, ForensicFinding, ForensicSample } from './types';

interface InvisibleDef {
  id: string;
  label: string;
  range: readonly [number, number];
}

const INVISIBLE: readonly InvisibleDef[] = [
  { id: 'zwsp', label: 'Zero-width space', range: [0x200b, 0x200b] },
  { id: 'zwnj', label: 'Zero-width non-joiner', range: [0x200c, 0x200c] },
  { id: 'zwj', label: 'Zero-width joiner', range: [0x200d, 0x200d] },
  { id: 'word-joiner', label: 'Word joiner', range: [0x2060, 0x2060] },
  { id: 'bom', label: 'Byte order mark / zero-width no-break space', range: [0xfeff, 0xfeff] },
  { id: 'soft-hyphen', label: 'Soft hyphen', range: [0x00ad, 0x00ad] },
  { id: 'lrm-rlm', label: 'Directional mark', range: [0x200e, 0x200f] },
  { id: 'bidi-embed', label: 'Bidi embedding control', range: [0x202a, 0x202e] },
  { id: 'invisible-op', label: 'Invisible operator', range: [0x2061, 0x2064] },
  { id: 'bidi-isolate', label: 'Bidi isolate', range: [0x2066, 0x2069] },
  { id: 'hangul-filler', label: 'Hangul filler', range: [0x3164, 0x3164] },
  { id: 'hangul-filler-half', label: 'Hangul filler (halfwidth)', range: [0xffa0, 0xffa0] },
  { id: 'tag-chars', label: 'Unicode tag character (hidden payload)', range: [0xe0000, 0xe007f] },
  { id: 'variation-selector', label: 'Variation selector', range: [0xfe00, 0xfe0f] },
  { id: 'variation-selector-supp', label: 'Variation selector (supplementary)', range: [0xe0100, 0xe01ef] },
];

const NBSP = 0x00a0;
/** French typography puts a no-break space before these. Legitimate there. */
const FRENCH_PUNCT = ';:!?»%)]';
const FRENCH_OPEN = '«([{';

/** Cyrillic and Greek letters that read as Latin. UTS #39 subset. */
const CONFUSABLES: ReadonlyMap<string, string> = new Map(Object.entries({
  // Cyrillic lowercase
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', і: 'i', ј: 'j',
  ѕ: 's', ԁ: 'd', һ: 'h', ӏ: 'l', ь: 'b', ԛ: 'q', ԝ: 'w', э: 'e', ѐ: 'e',
  // Cyrillic uppercase
  А: 'A', В: 'B', Е: 'E', З: '3', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P',
  С: 'C', Т: 'T', У: 'Y', Х: 'X', Ѕ: 'S', І: 'I', Ј: 'J',
  // Greek
  α: 'a', ο: 'o', ε: 'e', ρ: 'p', ν: 'v', τ: 't', υ: 'u', ι: 'i', κ: 'k',
  μ: 'm', χ: 'x', γ: 'y', Α: 'A', Β: 'B', Ε: 'E', Ο: 'O', Ρ: 'P', Τ: 'T',
  Χ: 'X', Υ: 'Y', Η: 'H', Μ: 'M', Ν: 'N', Κ: 'K', Ζ: 'Z',
  // Latin-looking oddities
  ɡ: 'g', ƅ: 'b', ⅰ: 'i', ⅼ: 'l', ⅽ: 'c',
}));

const LATIN = /\p{Script=Latin}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const GREEK = /\p{Script=Greek}/u;

const codePointLabel = (char: string): string =>
  `U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;

function findInvisible(text: string): ForensicFinding[] {
  const byId = new Map<string, ForensicFinding>();

  let index = 0;
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    const def = INVISIBLE.find((d) => cp >= d.range[0] && cp <= d.range[1]);

    if (def) {
      const finding = byId.get(def.id) ?? { id: def.id, label: def.label, count: 0, legitimate: false, samples: [] };
      finding.count += 1;
      if (finding.samples.length < 8) finding.samples.push({ char, code: codePointLabel(char), index });
      byId.set(def.id, finding);
    } else if (cp === NBSP) {
      // Legitimate in French typography, suspicious anywhere else.
      const before = text[index - 1] ?? '';
      const after = text[index + 1] ?? '';
      const legit = FRENCH_PUNCT.includes(after) || FRENCH_OPEN.includes(before);
      const finding = byId.get('nbsp') ?? {
        id: 'nbsp',
        label: 'No-break space',
        count: 0,
        legitimate: true,
        samples: [],
      };
      finding.count += 1;
      finding.legitimate = finding.legitimate && legit;
      if (finding.samples.length < 8) {
        finding.samples.push({ char, code: codePointLabel(char), index, note: legit ? 'French typography' : 'unexpected position' });
      }
      byId.set('nbsp', finding);
    }
    index += char.length;
  }

  return [...byId.values()];
}

function findHomoglyphs(text: string): { findings: ForensicFinding[]; mixedWords: string[] } {
  const samples: ForensicSample[] = [];
  const mixedWords: string[] = [];
  let mixedCount = 0;

  const wordRe = /[\p{L}\p{N}]+/gu;
  let match: RegExpExecArray | null;

  while ((match = wordRe.exec(text)) !== null) {
    const word = match[0];
    const offset = match.index;
    let hasLatin = false;
    let hasConfusableScript = false;
    const flagged: ForensicSample[] = [];

    for (let i = 0; i < word.length; i += 1) {
      const char = word[i]!;
      if (LATIN.test(char)) hasLatin = true;
      if (CYRILLIC.test(char) || GREEK.test(char)) {
        hasConfusableScript = true;
        if (CONFUSABLES.has(char)) {
          flagged.push({ char, code: codePointLabel(char), index: offset + i, note: `looks like "${CONFUSABLES.get(char)}"` });
        }
      }
    }

    if (hasLatin && hasConfusableScript) {
      mixedCount += 1;
      if (mixedWords.length < 10) mixedWords.push(word);
      samples.push(...flagged.slice(0, 4));
    }
  }

  const findings: ForensicFinding[] = [];
  if (mixedCount > 0) {
    findings.push({
      id: 'mixed-script',
      label: 'Mixed-script word (homoglyph substitution)',
      count: mixedCount,
      legitimate: false,
      samples: samples.slice(0, 10),
    });
  }
  return { findings, mixedWords };
}

/** Rebuild a safe version of the text: strip invisibles, fold confusables. */
export function cleanText(text: string): string {
  let out = '';
  let index = 0;
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    const invisible = INVISIBLE.some((d) => cp >= d.range[0] && cp <= d.range[1]);
    if (!invisible) out += CONFUSABLES.get(char) ?? char;
    index += char.length;
  }
  return out;
}

/**
 * @param text raw input
 * @returns forensic report with a 0..1 integrity score (1 = evasion detected)
 */
export function analyseForensics(text: string): ForensicsResult {
  if (!text) {
    return { score: 0, invisibleCount: 0, homoglyphCount: 0, mixedScriptWords: [], findings: [], cleanedText: '' };
  }

  const invisibleFindings = findInvisible(text);
  const { findings: homoglyphFindings, mixedWords } = findHomoglyphs(text);
  const findings = [...invisibleFindings, ...homoglyphFindings];

  const invisibleCount = invisibleFindings
    .filter((f) => !f.legitimate)
    .reduce((sum, f) => sum + f.count, 0);
  const homoglyphCount = homoglyphFindings.reduce((sum, f) => sum + f.count, 0);

  // Rare characters are strong evidence; density matters less than presence.
  let score = 0;
  score += Math.min(1, invisibleCount / 3) * 0.7;
  score += Math.min(1, homoglyphCount / 2) * 0.9;
  if (findings.some((f) => f.id === 'tag-chars')) score = 1;
  const legitimateOnly = invisibleFindings.every((f) => f.legitimate);
  if (legitimateOnly && homoglyphCount === 0) score = Math.min(score, 0.15);

  return {
    score: Math.max(0, Math.min(1, score)),
    invisibleCount,
    homoglyphCount,
    mixedScriptWords: mixedWords,
    findings,
    cleanedText: cleanText(text),
  };
}
