/**
 * Layer 1: the local statistical engine.
 *
 * Rewritten after a real false negative: a ChatGPT dissertation in French
 * scored "94 % human" while an actual human paragraph scores "94 % AI" nowhere.
 * Four causes, all fixed here:
 *
 *   1. Headings ("Introduction", "I. La vie…", "Conclusion") were counted as
 *      1-8 word sentences, inflating the standard deviation and faking human
 *      rhythm. They are now excluded before burstiness is computed.
 *   2. Paragraph isomorphism was not measured. Model dissertations are built
 *      from paragraphs of 2-4 sentences, all about the same length.
 *   3. Systematic enumerations ("philosophiques, religieuses et scientifiques")
 *      are a strong French LLM tell and were ignored.
 *   4. French academic connectives at the start of paragraphs ("Cependant,",
 *      "Dès lors,", "En définitive,") and dissertation clichés ("depuis les
 *      origines de l'humanité", "il serait réducteur d'affirmer que") were not
 *      in the lexicon.
 *
 * The score is a weighted blend of named signals, all returned with their
 * value, so a reader can disagree with the reasoning instead of a black box.
 */

import { MARKERS, MARKERS_BY_LANG, STRUCTURE_PATTERNS, HEDGE_VERBS_BY_LANG, fold } from './lexicon';
import { analyseForensics } from './forensics';
import { splitSentences, tokenize, countParagraphs, type Segment } from './segments';
import type {
  AnalysisResult, Band, MarkerHit, Msg, SentenceFlags, SentenceScore, SubScores, TextStats,
} from './types';

/* ------------------------------------------------------------- word lists */

const PERSONAL_PRONOUNS = new Set([
  'je', 'j', 'moi', 'mon', 'ma', 'mes', 'nous', 'notre', 'nos', 'vous', 'votre', 'vos',
  'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'you', 'your',
]);

/** Prudent verbs that let an LLM assert without committing. Very French-essay. */

/** Connectives that open a paragraph in machine-written French essays. */
const OPENING_CONNECTORS = [
  'cependant', 'pourtant', 'toutefois', 'néanmoins', 'ainsi', 'dès lors',
  'en définitive', 'par ailleurs', 'de même', 'enfin', 'en outre', 'de plus',
  'par conséquent', 'en somme', 'en conclusion', 'en résumé', 'de ce fait',
  'néanmoins', 'd\'une part', 'd\'autre part', 'contrairement à', 'si la ', 'si le ',
  'certes', 'il convient', 'force est',
];

/** Dissertation clichés, FR. Weight 3 = a strong tell. */
const FR_CLICHES: ReadonlyArray<{ phrase: string; weight: number }> = [
  { phrase: "depuis les origines de l'humanité", weight: 3 },
  { phrase: 'depuis la nuit des temps', weight: 3 },
  { phrase: 'occupent une place centrale dans', weight: 3 },
  { phrase: 'occupe une place centrale dans', weight: 3 },
  { phrase: 'quant à elle, constitue', weight: 3 },
  { phrase: 'quant à lui, constitue', weight: 3 },
  { phrase: 'une question essentielle se pose', weight: 3 },
  { phrase: 'dès lors, on peut se demander', weight: 3 },
  { phrase: 'nous étudierons d\'abord', weight: 3 },
  { phrase: 'puis nous analyserons', weight: 3 },
  { phrase: 'avant de montrer', weight: 2 },
  { phrase: 'ne se résume donc pas au simple fait de', weight: 3 },
  { phrase: 'indépendamment de leur', weight: 2 },
  { phrase: 'il serait réducteur d\'affirmer que', weight: 3 },
  { phrase: 'constituent deux dimensions indissociables', weight: 3 },
  { phrase: 'en définitive, nous ne maîtrisons ni', weight: 3 },
  { phrase: 'il nous appartient de chercher comment', weight: 3 },
  { phrase: 'cette idée rejoint la pensée de', weight: 3 },
  { phrase: 'propose toutefois une réflexion', weight: 3 },
  { phrase: 'demeure une question philosophique', weight: 3 },
  { phrase: 'rappelle la fragilité de la condition humaine', weight: 3 },
  { phrase: 'la conscience de notre finitude', weight: 3 },
  { phrase: 'de manière plus authentique', weight: 2 },
  { phrase: 'les limites de notre pouvoir', weight: 2 },
  { phrase: 'il nous appartient', weight: 2 },
  { phrase: 'davantage de valeur à la vie', weight: 2 },
  { phrase: 'afin qu\'il puisse', weight: 2 },
  { phrase: 'elle invite plutôt à', weight: 2 },
  { phrase: 'cette continuité ne signifie pas', weight: 2 },
  { phrase: 'il demeure confronté', weight: 3 },
  { phrase: 'représente une frontière', weight: 3 },
  { phrase: 'suscite ainsi', weight: 2 },
  { phrase: 'elle nous oblige à réfléchir', weight: 3 },
  { phrase: 'notre place dans le monde', weight: 2 },
  { phrase: 'la valeur du temps qui nous est accordé', weight: 3 },
  { phrase: 'les limites de notre existence et de nos connaissances', weight: 3 },
  { phrase: "avant d'analyser", weight: 2 },
  { phrase: 'puis de montrer comment', weight: 3 },
  { phrase: 'la nature de nos relations', weight: 2 },
  { phrase: 'il serait illusoire de prétendre', weight: 3 },
  { phrase: 'ce que nous faisons du temps dont nous disposons', weight: 3 },
  // Encyclopedic, answer-shaped French: the register of a chat reply, not an essay.
  { phrase: "il s'agit de", weight: 1 },
  { phrase: "l'ensemble des", weight: 2 },
  { phrase: 'ainsi que', weight: 1 },
  { phrase: 'a travers le monde', weight: 2 },
  { phrase: 'il se compose de', weight: 2 },
  { phrase: 'il repose sur', weight: 2 },
  { phrase: 'au-dela', weight: 1 },
  { phrase: 'a la fois une', weight: 2 },
  { phrase: 'parmi les', weight: 1 },
  { phrase: 'figurent', weight: 2 },
  { phrase: 'notamment', weight: 1 },
  { phrase: 'principalement', weight: 1 },
  { phrase: 'de type', weight: 1 },
];

// Accent-folded copies, built once. Matching must compare the same shape on
// both sides: fold() strips accents, so an accented phrase list never matches a
// folded text otherwise.
const DEFAULT_MARKERS = MARKERS;

/** Folded marker and hedge packs per language, built once. */
function foldedMarkers(lang: string) {
  const pack = MARKERS_BY_LANG[lang] ?? DEFAULT_MARKERS;
  return pack.map((m) => ({ phrase: fold(m.phrase), raw: m.phrase, weight: m.weight }));
}
const FOLDED_BY_LANG = new Map<string, ReturnType<typeof foldedMarkers>>();
function markersFor(lang: string) {
  if (!FOLDED_BY_LANG.has(lang)) FOLDED_BY_LANG.set(lang, foldedMarkers(lang));
  return FOLDED_BY_LANG.get(lang)!;
}
const FOLDED_CLICHES = FR_CLICHES.map((c) => ({ phrase: fold(c.phrase), raw: c.phrase, weight: c.weight }));
const FOLDED_HEDGES_BY_LANG = new Map<string, Set<string>>();
function hedgesFor(lang: string) {
  if (!FOLDED_HEDGES_BY_LANG.has(lang)) {
    FOLDED_HEDGES_BY_LANG.set(lang, new Set((HEDGE_VERBS_BY_LANG[lang] ?? HEDGE_VERBS_BY_LANG.en ?? []).map((w) => fold(w))));
  }
  return FOLDED_HEDGES_BY_LANG.get(lang)!;
}
const FOLDED_CONNECTORS = OPENING_CONNECTORS.map((c) => fold(c));

/** French numbers up to the plan markers we expect. */
const ROMAN_PLAN = /^(?:[IVXLC]{1,4}[.)]\s|\d{1,2}[.)]\s)/;
const HEADING_WORD = /^(?:introduction|conclusion|partie|chapitre|résumé|resume|abstract|sommaire|annexe|bibliographie|références)\b/i;

/**
 * A three-or-more item enumeration: at least two commas inside the same clause
 * before a closing "et" / "ou". Written as a function rather than one regex
 * because French items are often multi-word ("d'émotions, de rencontres,
 * de réussites, d'échecs et d'apprentissages"), which a single-token pattern
 * silently misses.
 */
function hasEnumeration(sentence: string): boolean {
  const re = /\s(?:et|ou)\s/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(sentence)) !== null) {
    const before = sentence.slice(Math.max(0, match.index - 180), match.index);
    // Only count commas inside the current clause.
    const clause = before.slice(Math.max(before.lastIndexOf('.'), before.lastIndexOf('?'), before.lastIndexOf('!'), before.lastIndexOf(';')) + 1);
    if ((clause.match(/,/g) ?? []).length >= 2) return true;
  }
  return false;
}

/* ---------------------------------------------------------------- helpers */

const clamp = (v: number, min = 0, max = 1): number => (v < min ? min : v > max ? max : v);

const mapLinear = (v: number, inMin: number, inMax: number): number => clamp((v - inMin) / (inMax - inMin));

const mapInverse = (v: number, inMin: number, inMax: number): number => 1 - mapLinear(v, inMin, inMax);

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const std = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};

/** Moving-average type-token ratio: length-independent lexical diversity. */
function mattr(words: string[], window = 50): number {
  if (words.length === 0) return 0;
  if (words.length <= window) return new Set(words).size / words.length;
  let total = 0;
  let count = 0;
  for (let i = 0; i + window <= words.length; i += 1) {
    const slice = words.slice(i, i + window);
    total += new Set(slice).size / window;
    count += 1;
  }
  return count ? total / count : 0;
}

/** Shannon entropy of character trigrams, in bits. */
function trigramEntropy(text: string): number {
  const clean = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (clean.length < 3) return 0;
  const counts = new Map<string, number>();
  let total = 0;
  for (let i = 0; i + 3 <= clean.length; i += 1) {
    const key = clean.slice(i, i + 3);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    total += 1;
  }
  let h = 0;
  for (const c of counts.values()) {
    const p = c / total;
    h -= p * Math.log2(p);
  }
  return h;
}

function repeatedRate(tokens: string[], n: number): number {
  if (tokens.length < n * 2) return 0;
  const seen = new Map<string, number>();
  let repeats = 0;
  for (let i = 0; i + n <= tokens.length; i += 1) {
    const key = tokens.slice(i, i + n).join(' ');
    const c = (seen.get(key) ?? 0) + 1;
    seen.set(key, c);
    if (c === 2) repeats += 1;
  }
  return repeats / Math.max(1, tokens.length - n + 1);
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let total = 0;
  let cursor = 0;
  for (;;) {
    const at = haystack.indexOf(needle, cursor);
    if (at === -1) break;
    total += 1;
    cursor = at + needle.length;
  }
  return total;
}

/* ------------------------------------------------------------- structure */

interface Paragraph {
  text: string;
  start: number;
  words: number;
  sentences: number;
  opensWithConnector: boolean;
}

/** A heading, a label or a stray line: not prose, must not reach burstiness. */
function isHeadingLine(text: string): boolean {
  const trimmed = fold(text).trim();
  if (!trimmed) return true;
  if (ROMAN_PLAN.test(trimmed)) return true;
  if (HEADING_WORD.test(trimmed)) return true;
  const words = tokenize(trimmed);
  // A short line with no sentence-ending punctuation is a title, not a sentence.
  if (words.length < 6 && !/[.!?…:]\s*$/.test(trimmed)) return true;
  return false;
}

function splitParagraphs(text: string): Paragraph[] {
  const out: Paragraph[] = [];
  const re = /[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const raw = match[0];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const start = match.index + (raw.length - raw.trimStart().length);
    if (isHeadingLine(trimmed)) continue;
    const sentences = splitSentences(trimmed, 'fr').filter((s) => !isHeadingLine(s.text));
    const first = fold(trimmed);
    out.push({
      text: trimmed,
      start,
      words: tokenize(trimmed).length,
      sentences: sentences.filter((s) => tokenize(s.text).length >= 6).length,
      opensWithConnector: FOLDED_CONNECTORS.some((c) => first.startsWith(`${c},`)),
    });
  }
  return out;
}

/* ---------------------------------------------------------------- markers */

interface MarkerScan {
  hits: MarkerHit[];
  weighted: number;
  spans: Array<{ start: number; end: number; weight: number; phrase: string }>;
}

function findMarkers(folded: string, lang: string): MarkerScan {
  const hits: MarkerHit[] = [];
  const spans: MarkerScan['spans'] = [];
  let weighted = 0;

  for (const marker of markersFor(lang)) {
    let cursor = 0;
    let count = 0;
    for (;;) {
      const at = folded.indexOf(marker.phrase, cursor);
      if (at === -1) break;
      count += 1;
      cursor = at + marker.phrase.length;
      if (spans.length < 4000) spans.push({ start: at, end: cursor, weight: marker.weight, phrase: marker.raw });
    }
    if (count > 0) {
      hits.push({ phrase: marker.raw, count, weight: marker.weight });
      weighted += count * marker.weight;
    }
  }

  hits.sort((a, b) => b.count * b.weight - a.count * a.weight);
  return { hits, weighted, spans };
}

function countStructures(text: string): number {
  let total = 0;
  for (const { re } of STRUCTURE_PATTERNS) {
    re.lastIndex = 0;
    const matches = text.match(re);
    if (matches) total += matches.length;
  }
  return total;
}

function bandFor(score: number): Band {
  if (score < 35) return 'human';
  if (score < 60) return 'mixed';
  return 'ai';
}

/* -------------------------------------------------------------- scoring */

interface Component {
  id: string;
  value: number;
  weight: number;
  /** i18n key. */
  label: string;
  /** i18n key plus params. */
  detail?: Msg;
  /**
   * False when the sample is too small to measure this signal. A signal that
   * cannot apply must not count as zero, or a short text is dragged toward
   * "human" by components that never had a chance to fire.
   */
  applicable?: boolean;
}

/**
 * Evidence components prove that something is there; they never prove that it is
 * absent. Including them in the average would drag ordinary prose down for not
 * being a formatted answer, which is not a defect. They raise the floor instead.
 */
const EVIDENCE_IDS = new Set(['formattedShape', 'assistantCloser']);

function blend(components: Component[]): number {
  const use = components.filter((c) => c.applicable !== false && !EVIDENCE_IDS.has(c.id));
  const total = use.reduce((sum, c) => sum + c.weight, 0);
  if (!total) return 0;
  return clamp(use.reduce((sum, c) => sum + c.value * c.weight, 0) / total);
}

/* ------------------------------------------------------------- sentences */

function sentenceFlags(
  segment: Segment,
  text: string,
  markers: MarkerScan,
  meanWords: number,
  stdWords: number,
  lang: string,
): { flags: SentenceFlags; score: number; reasons: Msg[] } {
  const words = tokenize(segment.text);
  const lower = words.map((w) => w.toLowerCase());
  const wordCount = words.length;

  const enumeration = hasEnumeration(segment.text);

  const hedgeSet = hedgesFor(lang);
  const hedgeCount = /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(text)
    ? (HEDGE_VERBS_BY_LANG[lang] ?? []).filter((h) => fold(text).includes(fold(h))).length
    : lower.filter((w) => hedgeSet.has(fold(w))).length;
  const hedging = hedgeCount > 0;

  const firstWord = fold(lower.slice(0, 3).join(' '));
  const connector = FOLDED_CONNECTORS.some((c) => firstWord.startsWith(c));
  const cliche = FOLDED_CLICHES.some((c) => text.slice(segment.start, segment.end).toLowerCase().includes(c.phrase));

  let markerWeight = 0;
  let markerPhrase: string | null = null;
  for (const span of markers.spans) {
    if (span.start >= segment.start && span.end <= segment.end) {
      markerWeight += span.weight;
      if (!markerPhrase || span.weight > 2) markerPhrase = span.phrase;
    }
  }

  const pronounRate = wordCount ? lower.filter((w) => PERSONAL_PRONOUNS.has(w)).length / wordCount : 0;
  const contractionRate = wordCount
    ? lower.filter((w) => w.includes("'") || w.includes('\u2019')).length / wordCount
    : 0;
  const deviation = stdWords > 0 ? Math.abs(wordCount - meanWords) / stdWords : 0;

  const parts: Array<{ v: number; w: number }> = [
    { v: mapInverse(deviation, 0, 1.6), w: 0.9 },
    { v: clamp(markerWeight / 3), w: 1.6 },
    { v: enumeration ? 1 : 0, w: 1.5 },
    { v: connector ? 1 : 0, w: 1.1 },
    { v: cliche ? 1 : 0, w: 1.4 },
    { v: hedging ? clamp(hedgeCount / 2) : 0, w: 0.8 },
    { v: mapInverse(pronounRate, 0.004, 0.05), w: 0.5 },
    { v: mapInverse(contractionRate, 0.004, 0.04), w: 0.4 },
  ];
  const totalWeight = parts.reduce((a, p) => a + p.w, 0);
  const local = parts.reduce((a, p) => a + p.v * p.w, 0) / totalWeight;

  const score = Math.round(clamp(local) * 100);

  const reasons: Msg[] = [];
  if (enumeration) reasons.push({ key: 'sReason.enumeration' });
  if (cliche) reasons.push({ key: 'sReason.cliche' });
  if (connector) reasons.push({ key: 'sReason.connector' });
  if (markerPhrase) reasons.push({ key: 'sReason.marker', params: { phrase: markerPhrase } });
  if (hedging) reasons.push({ key: 'sReason.hedge', params: { word: String(lower.filter((w) => hedgeSet.has(fold(w)))[0] ?? '') } });
  if (deviation < 0.6 && wordCount >= 8) reasons.push({ key: 'sReason.deviation', params: { n: wordCount } });
  if (pronounRate === 0 && contractionRate === 0 && wordCount >= 10) reasons.push({ key: 'sReason.noVoice' });
  if (!reasons.length) reasons.push({ key: score >= 60 ? 'sReason.weak' : 'sReason.varied' });

  return { flags: { enumeration, hedging, connector, cliche }, score, reasons };
}

/* ------------------------------------------------------------------ main */

/**
 * Full document analysis.
 * @param text raw input
 * @param locale BCP-47 tag for sentence segmentation
 */
export function analyse(text: string, locale = 'fr'): AnalysisResult {
  const source = text ?? '';
  const folded = fold(source);
  // Chinese, Japanese and Korean do not separate words with spaces, so anything
  // built on whitespace tokens has to be handled differently there.
  const cjk = /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/.test(source);
  const words = tokenize(source);
  const lowerWords = words.map((w) => w.toLowerCase());
  const wordCount = words.length;

  // --- sentences, with headings filtered out of the rhythm measurement -----
  const allSentences = splitSentences(source, locale);
  const prose = allSentences.filter((s) => !isHeadingLine(s.text) && tokenize(s.text).length >= 6 && /[.!?…]\s*$/.test(s.text.trim()));
  const rhythmSentences = prose.length >= 4 ? prose : allSentences.filter((s) => tokenize(s.text).length >= 4);
  const rhythmLengths = rhythmSentences.map((s) => tokenize(s.text).length);
  const meanWords = mean(rhythmLengths);
  const stdWords = std(rhythmLengths);
  const burstiness = meanWords > 0 ? stdWords / meanWords : 0;

  // --- paragraphs ----------------------------------------------------------
  const paragraphs = splitParagraphs(source);
  const paragraphWordCounts = paragraphs.map((p) => p.words).filter((n) => n > 0);
  const paraMean = mean(paragraphWordCounts);
  const paraStd = std(paragraphWordCounts);
  const paragraphCv = paraMean > 0 ? paraStd / paraMean : 0;
  const inRange = paragraphs.filter((p) => p.sentences >= 2 && p.sentences <= 4).length;
  const paragraphIsomorphism = paragraphs.length >= 4 ? inRange / paragraphs.length : 0;
  const connectorParagraphs = paragraphs.filter((p) => p.opensWithConnector).length;
  const connectorRatio = paragraphs.length ? connectorParagraphs / paragraphs.length : 0;

  // --- enumerations --------------------------------------------------------
  const sentencesWithEnum = allSentences.filter((s) => hasEnumeration(s.text)).length;
  const enumSentenceRatio = allSentences.length ? sentencesWithEnum / allSentences.length : 0;

  // --- lexical -------------------------------------------------------------
  const unique = new Set(lowerWords);
  const ttr = wordCount ? unique.size / wordCount : 0;
  const mattr50 = mattr(lowerWords, 50);
  const trigramH = trigramEntropy(source);
  const bigramRepeat = repeatedRate(lowerWords, 2);
  const trigramRepeat = repeatedRate(lowerWords, 3);

  // --- markers, clichés, hedges -------------------------------------------
  const markers = findMarkers(folded, locale);
  const ternary = countStructures(source);
  const discourseMarkers = FOLDED_CONNECTORS
    .filter((c) => !c.endsWith(' '))
    .reduce((sum, c) => sum + countOccurrences(folded, `${c},`), 0);
  const clicheWeighted = FOLDED_CLICHES.reduce((sum, c) => sum + countOccurrences(folded, c.phrase) * c.weight, 0);
  const hedgeSet = hedgesFor(locale);
  // In scripts without word separators a hedge is embedded inside a long token,
  // so it has to be found by substring rather than by token equality.
  const hedgeCount = cjk
    ? (HEDGE_VERBS_BY_LANG[locale] ?? []).filter((h) => folded.includes(fold(h))).length
    : lowerWords.filter((w) => hedgeSet.has(fold(w))).length;
  const forensics = analyseForensics(source);

  const per100 = (n: number): number => (wordCount ? (n / wordCount) * 100 : 0);

  // A chat answer is not prose: it is headings, rules, bullet lists, bold labels
  // and a closing offer to continue. None of that is prose style, and a detector
  // that only measures prose misses it entirely.
  const lines = source.split('\n');
  const nonEmpty = lines.filter((l) => l.trim());
  const bulletLines = nonEmpty.filter((l) => /^\s*[-*\u2022]\s+/.test(l)).length;
  const headingLines = nonEmpty.filter((l) => /^#{1,6}\s/.test(l)).length;
  const numberHeadings = nonEmpty.filter((l) => /^\s*\d+[.)]\s+\S/.test(l)).length;
  const ruleLines = nonEmpty.filter((l) => /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(l)).length;
  const boldSpans = (source.match(/\*\*[^*\n]{1,80}\*\*/g) ?? []).length;
  const bulletHeavy = nonEmpty.length > 0 && bulletLines / nonEmpty.length > 0.25;
  const structureScore = bulletLines + headingLines * 1.6 + numberHeadings * 1.4 + ruleLines * 1.2 + boldSpans * 0.8;
  const formattedShape = mapLinear(per100(structureScore), 0.4, 4);

  const tail = source.slice(-320);
  const assistantCloser = /(?:souhaites-tu|veux-tu que|n['\u2019]h[ée]site[sz]? pas|dites-moi si|dis-moi si|do you want me to|would you like me to|let me know if you|i hope this helps|feel free to ask|\u00bfquieres que|m[o\u00f6]chtest du|vuoi che|quer que eu|wil je dat|\u0445\u043e\u0447\u0435\u0448\u044c, \u0447\u0442\u043e\u0431\u044b \u044f|\u9700\u8981\u6211|\u0647\u0644 \u062a\u0631\u064a\u062f \u0623\u0646)/i.test(tail) ? 1 : 0;
  // The cliché, connective and dialectical lists are French and English only.
  // Counting them as zero elsewhere would drag every other language toward
  // "human", which is exactly the bug this guard prevents.
  const hasFrEnLists = locale === 'fr' || locale === 'en';

  /* --- components -------------------------------------------------------- */

  const components: Component[] = [
    {
      id: 'rhythm',
      label: 'sig.rhythm',
      // A handful of sentences cannot establish a rhythm either way.
      value: mapInverse(burstiness, 0.32, 0.58) * clamp(rhythmSentences.length / 10),
      weight: 1.8,
      applicable: rhythmSentences.length >= 8,
      detail: { key: 'sigDetail.rhythm', params: { cv: burstiness.toFixed(3), n: rhythmSentences.length } },
    },
    {
      id: 'paragraphIsomorphism',
      label: 'sig.isomorphism',
      value: paragraphs.length >= 4 ? clamp((paragraphIsomorphism - 0.35) / 0.45) : 0,
      applicable: paragraphs.length >= 4 && !bulletHeavy,
      weight: 1.9,
      detail: { key: 'sigDetail.isomorphism', params: { n: Math.round(paragraphIsomorphism * 100) } },
    },
    {
      id: 'paragraphUniformity',
      label: 'sig.paragraphUniformity',
      // Uniformity is meaningless below five paragraphs.
      value: paragraphs.length >= 5 ? mapInverse(paragraphCv, 0.20, 0.50) : 0,
      applicable: paragraphs.length >= 5 && !bulletHeavy,
      weight: 1.1,
      detail: { key: 'sigDetail.cv', params: { cv: paragraphCv.toFixed(3) } },
    },
    {
      id: 'enumerations',
      label: 'sig.enumerations',
      value: clamp((enumSentenceRatio - 0.10) / 0.30) * clamp(allSentences.length / 12),
      applicable: allSentences.length >= 8,
      weight: 1.5,
      detail: { key: 'sigDetail.enum', params: { n: Math.round(enumSentenceRatio * 100), total: sentencesWithEnum } },
    },
    {
      id: 'connectors',
      label: 'sig.connectors',
      value: clamp((connectorRatio - 0.20) / 0.40),
      applicable: paragraphs.length >= 4 && !bulletHeavy,
      weight: 1.3,
      detail: { key: 'sigDetail.connectors', params: { n: Math.round(connectorRatio * 100) } },
    },
    {
      id: 'discourse',
      label: 'sig.discourse',
      applicable: hasFrEnLists,
      value: mapLinear(per100(discourseMarkers), 0.25, 1.8),
      weight: 1.6,
      detail: { key: 'sigDetail.occurrences', params: { n: discourseMarkers } },
    },
    {
      id: 'formattedShape',
      label: 'sig.formattedShape',
      value: formattedShape,
      weight: 2.2,
      detail: { key: 'sigDetail.formattedShape', params: { bullets: bulletLines, headings: headingLines + numberHeadings, rules: ruleLines, bold: boldSpans } },
    },
    {
      id: 'assistantCloser',
      label: 'sig.assistantCloser',
      value: assistantCloser,
      weight: 2.6,
    },
    {
      id: 'cliches',
      label: 'sig.cliches',
      applicable: hasFrEnLists,
      value: mapLinear(per100(clicheWeighted), 0.2, 2.2),
      weight: 1.9,
    },
    {
      id: 'hedges',
      label: 'sig.hedges',
      value: mapLinear(per100(hedgeCount), 0.35, 2.4),
      weight: 1.3,
      detail: { key: 'sigDetail.occurrences', params: { n: hedgeCount } },
    },
    {
      id: 'lexicalVariety',
      label: 'sig.lexicalVariety',
      applicable: !cjk,
      value: mapInverse(ttr, 0.33, 0.62),
      weight: 0.8,
      detail: { key: 'sigDetail.ttr', params: { ttr: ttr.toFixed(3), mattr: mattr50.toFixed(3) } },
    },
    {
      id: 'repetition',
      label: 'sig.repetition',
      applicable: !cjk,
      value: clamp(Math.max(trigramRepeat / 0.18, bigramRepeat / 0.35)),
      weight: 0.7,
    },
    {
      id: 'llmMarkers',
      label: 'sig.llmMarkers',
      value: mapLinear(per100(markers.weighted), 0.3, 3.0),
      weight: 1.2,
      detail: { key: 'sigDetail.occurrences', params: { n: markers.hits.length } },
    },
    {
      id: 'ternary',
      label: 'sig.ternary',
      applicable: hasFrEnLists,
      value: mapLinear(ternary, 0.5, 4),
      weight: 0.7,
      detail: { key: 'sigDetail.ternary', params: { n: ternary } },
    },
  ];

  const raw = blend(components);

  // The curve is deliberately steep: routine French academic prose is smooth
  // and formulaic, and it must not land in the "human" band.
  let score = Math.round((1 / (1 + Math.exp(-(raw - 0.30) * 10.5))) * 100);

  // Specific structural evidence is not a matter of degree.
  // Structural overrides need a real sample: on a short note these patterns are
  // ordinary human writing, not evidence.
  const substantial = wordCount >= 150 && allSentences.length >= 12;
  if (substantial && paragraphIsomorphism >= 0.75 && paragraphs.length >= 4) score = Math.max(score, 72);
  if (substantial && connectorRatio >= 0.4 && paragraphs.length >= 4) score = Math.max(score, 70);
  if (substantial && enumSentenceRatio >= 0.25) score = Math.max(score, 66);
  // A closing offer to continue, or a heavily formatted answer, is not a matter
  // of degree: it is the shape of a chat reply.
  if (assistantCloser) score = Math.max(score, 72);
  if (formattedShape >= 0.7) score = Math.max(score, 70);
  // Both together is the signature of a chat answer: a formatted breakdown that
  // ends by offering to continue.
  if (assistantCloser && formattedShape >= 0.7) score = Math.max(score, 88);
  if (forensics.score >= 0.6) score = Math.max(score, 72);

  if (wordCount < 40) score = Math.round(score * 0.75 + 50 * 0.25);
  score = Math.max(0, Math.min(100, score));

  const subScores: SubScores = {
    syntacticRegularity: clamp(components.find((c) => c.id === 'rhythm')!.value),
    lexicalPredictability: clamp(
      blend([
        { id: 'a', label: '', value: clamp(components.find((c) => c.id === 'lexicalVariety')!.value), weight: 0.5 },
        { id: 'b', label: '', value: clamp(components.find((c) => c.id === 'repetition')!.value), weight: 0.5 },
      ]),
    ),
    llmMarkers: clamp(
      blend([
        { id: 'a', label: '', value: clamp(components.find((c) => c.id === 'cliches')!.value), weight: 1 },
        { id: 'b', label: '', value: clamp(components.find((c) => c.id === 'llmMarkers')!.value), weight: 1 },
        { id: 'c', label: '', value: clamp(components.find((c) => c.id === 'enumerations')!.value), weight: 0.8 },
      ]),
    ),
    characterIntegrity: forensics.score,
  };

  const stats: TextStats = {
    words: wordCount,
    characters: source.length,
    charactersNoSpaces: source.replace(/\s/g, '').length,
    sentences: allSentences.length,
    paragraphs: countParagraphs(source),
    uniqueWords: unique.size,
    typeTokenRatio: Math.round(ttr * 1000) / 1000,
    mattr: Math.round(mattr50 * 1000) / 1000,
    shannonTrigram: Math.round(trigramH * 1000) / 1000,
    meanSentenceWords: Math.round(meanWords * 10) / 10,
    stdSentenceWords: Math.round(stdWords * 10) / 10,
    burstiness: Math.round(burstiness * 1000) / 1000,
    enumerationRatio: Math.round(enumSentenceRatio * 1000) / 1000,
    connectorRatio: Math.round(connectorRatio * 1000) / 1000,
    paragraphIsomorphism: Math.round(paragraphIsomorphism * 1000) / 1000,
    hedgesPer100: Math.round(per100(hedgeCount) * 100) / 100,
  };

  // A sentence in a document with a 88 % isomorphic structure is suspicious even
  // when the sentence itself is unremarkable, so the local score is blended with
  // the document score rather than standing alone.
  const sentences: SentenceScore[] = allSentences.map((segment) => {
    const { flags, score: local, reasons } = sentenceFlags(segment, source, markers, meanWords, stdWords, locale);
    const words = tokenize(segment.text).length;
    const weight = words < 6 ? 0.25 : 0.55;
    const blended = Math.round(weight * local + (1 - weight) * score);
    return {
      text: segment.text,
      start: segment.start,
      end: segment.end,
      words,
      score: blended,
      band: bandFor(blended),
      reasons,
      flags,
    };
  });

  const confidence = Math.round(
    clamp(0.15 + Math.min(1, wordCount / 250) * 0.7 + Math.min(1, markers.hits.length / 4) * 0.1, 0.1, 0.95) * 100,
  );

  let verdictReason: Msg;
  if (forensics.score >= 0.6) verdictReason = { key: 'reason.forensics' };
  else if (score >= 60 && substantial && paragraphIsomorphism >= 0.75 && paragraphs.length >= 4) verdictReason = { key: 'reason.isomorphism' };
  else if (score >= 60 && substantial && connectorRatio >= 0.4 && paragraphs.length >= 4) verdictReason = { key: 'reason.connectors' };
  else if (score >= 60 && substantial && enumSentenceRatio >= 0.25) verdictReason = { key: 'reason.enumerations' };
  else if (assistantCloser) verdictReason = { key: 'reason.closer' };
  else if (formattedShape >= 0.6) verdictReason = { key: 'reason.formatted' };
  else if (score >= 60) verdictReason = { key: 'reason.rhythm' };
  else if (score >= 35) verdictReason = { key: 'reason.mixed' };
  else verdictReason = { key: 'reason.human' };

  return {
    score,
    band: bandFor(score),
    confidence,
    subScores,
    stats,
    sentences,
    markers: markers.hits.slice(0, 12),
    ternaryStructures: ternary,
    forensics,
    verdictReason,
    components: components.map((c) => ({ id: c.id, label: c.label, value: Math.round(c.value * 1000) / 1000, weight: c.weight, detail: c.detail ?? null, applicable: c.applicable !== false })),
  };
}
