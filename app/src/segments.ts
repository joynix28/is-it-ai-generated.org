/**
 * Sentence segmentation and tokenisation.
 *
 * Uses the platform's Intl.Segmenter, which handles French punctuation,
 * abbreviations and ellipses correctly, and falls back to a guarded regex on
 * engines without it. Offsets always point back into the original string.
 */

export interface Segment {
  text: string;
  start: number;
  end: number;
}

const FALLBACK_TERMINATORS = new Set(['.', '!', '?', '…', '。', '！', '？', '\n']);

function splitWithRegex(text: string): Segment[] {
  const out: Segment[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (!FALLBACK_TERMINATORS.has(text[i]!)) continue;
    // Do not break on a decimal point.
    if (text[i] === '.' && /\d/.test(text[i - 1] ?? '') && /\d/.test(text[i + 1] ?? '')) continue;
    let end = i + 1;
    while (end < text.length && /["'”’)»\]]/.test(text[end]!)) end += 1;
    pushSegments(out, text, start, end);
    start = end;
    i = end - 1;
  }
  pushSegments(out, text, start, text.length);
  return out;
}

function pushSegments(out: Segment[], text: string, from: number, to: number): void {
  const raw = text.slice(from, to);
  const trimmed = raw.trim();
  if (!trimmed) return;
  const lead = raw.length - raw.trimStart().length;
  out.push({ text: trimmed, start: from + lead, end: from + lead + trimmed.length });
}

let segmenter: Intl.Segmenter | null | undefined;

function getSegmenter(locale: string): Intl.Segmenter | null {
  if (segmenter !== undefined) return segmenter;
  try {
    segmenter = new Intl.Segmenter(locale, { granularity: 'sentence' });
  } catch {
    segmenter = null;
  }
  return segmenter;
}

/** Split into sentences with offsets into `text`. */
export function splitSentences(text: string, locale = 'en'): Segment[] {
  if (!text.trim()) return [];
  const seg = getSegmenter(locale);
  if (!seg) return splitWithRegex(text);

  const out: Segment[] = [];
  for (const part of seg.segment(text)) {
    const raw = part.segment;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const lead = raw.length - raw.trimStart().length;
    out.push({ text: trimmed, start: part.index + lead, end: part.index + lead + trimmed.length });
  }
  return out.length ? out : splitWithRegex(text);
}

const WORD_RE = /[\p{L}\p{N}]+(?:['’\u2019-][\p{L}\p{N}]+)*/gu;

/** Words with their lowercase form, excluding punctuation. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(text)) !== null) out.push(m[0]);
  return out;
}

export function countWords(text: string): number {
  return tokenize(text).length;
}

/** Paragraphs, split on blank lines. */
export function countParagraphs(text: string): number {
  return text.split(/\n\s*\n+/).filter((p) => p.trim()).length;
}
