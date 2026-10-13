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

import { MARKERS, STRUCTURE_PATTERNS, fold } from './lexicon';
import { analyseForensics } from './forensics';
import { splitSentences, tokenize, countParagraphs, type Segment } from './segments';
import type {
  AnalysisResult, Band, MarkerHit, SentenceFlags, SentenceScore, SubScores, TextStats,
} from './types';

/* ------------------------------------------------------------- word lists */

const PERSONAL_PRONOUNS = new Set([
  'je', 'j', 'moi', 'mon', 'ma', 'mes', 'nous', 'notre', 'nos', 'vous', 'votre', 'vos',
  'i', 'me', 'my', 'mine', 'we', 'us', 'our', 'you', 'your',
]);

/** Prudent verbs that let an LLM assert without committing. Very French-essay. */
const HEDGE_VERBS = [
  'peut', 'peuvent', 'pourrait', 'pourraient', 'demeure', 'demeurent', 'constitue',
  'constituent', 'représente', 'représentent', 'implique', 'impliquent', 'semble',
  'semblent', 'paraît', 'paraissent', 'nécessairement', 'susciter', 'suscite',
  'permet', 'permettent', 'tend', 'tendent', 's\'avère', 'convient',
];

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
];

// Accent-folded copies, built once. Matching must compare the same shape on
// both sides: fold() strips accents, so an accented phrase list never matches a
// folded text otherwise.
const FOLDED_MARKERS = MARKERS.map((m) => ({ phrase: fold(m.phrase), raw: m.phrase, weight: m.weight }));
const FOLDED_CLICHES = FR_CLICHES.map((c) => ({ phrase: fold(c.phrase), raw: c.phrase, weight: c.weight }));
const FOLDED_HEDGES = new Set(HEDGE_VERBS.map((w) => fold(w)));
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

function findMarkers(folded: string): MarkerScan {
  const hits: MarkerHit[] = [];
  const spans: MarkerScan['spans'] = [];
  let weighted = 0;

  for (const marker of FOLDED_MARKERS) {
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
  label: string;
  detail?: string;
}

function blend(components: Component[]): number {
  const total = components.reduce((sum, c) => sum + c.weight, 0);
  if (!total) return 0;
  return clamp(components.reduce((sum, c) => sum + c.value * c.weight, 0) / total);
}

/* ------------------------------------------------------------- sentences */

function sentenceFlags(
  segment: Segment,
  text: string,
  markers: MarkerScan,
  meanWords: number,
  stdWords: number,
): { flags: SentenceFlags; score: number; reasons: string[] } {
  const words = tokenize(segment.text);
  const lower = words.map((w) => w.toLowerCase());
  const wordCount = words.length;

  const enumeration = hasEnumeration(segment.text);

  const hedgeCount = lower.filter((w) => FOLDED_HEDGES.has(fold(w))).length;
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

  const reasons: string[] = [];
  if (enumeration) reasons.push('Énumération de 3 éléments ou plus');
  if (cliche) reasons.push('Cliché de dissertation typique d’un LLM');
  if (connector) reasons.push('Connecteur logique scolaire en tête de phrase');
  if (markerPhrase) reasons.push(`Tic de langage IA : « ${markerPhrase} »`);
  if (hedging) reasons.push(`Verbe de prudence (« ${lower.filter((w) => FOLDED_HEDGES.has(fold(w)))[0]} »)`);
  if (deviation < 0.6 && wordCount >= 8) reasons.push(`Longueur très proche de la moyenne (${wordCount} mots)`);
  if (pronounRate === 0 && contractionRate === 0 && wordCount >= 10) reasons.push('Aucune marque de voix personnelle');
  if (!reasons.length) reasons.push(score >= 60 ? 'Signaux faibles mais cumulés' : 'Rythme et vocabulaire variés');

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
  const markers = findMarkers(folded);
  const ternary = countStructures(source);
  const discourseMarkers = FOLDED_CONNECTORS
    .filter((c) => !c.endsWith(' '))
    .reduce((sum, c) => sum + countOccurrences(folded, `${c},`), 0);
  const clicheWeighted = FOLDED_CLICHES.reduce((sum, c) => sum + countOccurrences(folded, c.phrase) * c.weight, 0);
  const hedgeCount = lowerWords.filter((w) => FOLDED_HEDGES.has(fold(w))).length;
  const forensics = analyseForensics(source);

  const per100 = (n: number): number => (wordCount ? (n / wordCount) * 100 : 0);

  /* --- components -------------------------------------------------------- */

  const components: Component[] = [
    {
      id: 'rhythm',
      label: 'Rythme plat (burstiness filtrée)',
      // A handful of sentences cannot establish a rhythm either way.
      value: mapInverse(burstiness, 0.32, 0.58) * clamp(rhythmSentences.length / 10),
      weight: 1.8,
      detail: `CV = ${burstiness.toFixed(3)} sur ${rhythmSentences.length} phrases de prose`,
    },
    {
      id: 'paragraphIsomorphism',
      label: 'Isomorphisme des paragraphes',
      value: paragraphs.length >= 4 ? clamp((paragraphIsomorphism - 0.35) / 0.45) : 0,
      weight: 1.9,
      detail: `${Math.round(paragraphIsomorphism * 100)} % des paragraphes font 2 à 4 phrases`,
    },
    {
      id: 'paragraphUniformity',
      label: 'Uniformité des paragraphes',
      // Uniformity is meaningless below five paragraphs.
      value: paragraphs.length >= 5 ? mapInverse(paragraphCv, 0.20, 0.50) : 0,
      weight: 1.1,
      detail: `CV = ${paragraphCv.toFixed(3)}`,
    },
    {
      id: 'enumerations',
      label: 'Énumérations systématiques',
      value: clamp((enumSentenceRatio - 0.10) / 0.30) * clamp(allSentences.length / 12),
      weight: 1.5,
      detail: `${Math.round(enumSentenceRatio * 100)} % des phrases, ${sentencesWithEnum} au total`,
    },
    {
      id: 'connectors',
      label: 'Connecteurs en tête de paragraphe',
      value: clamp((connectorRatio - 0.20) / 0.40),
      weight: 1.3,
      detail: `${Math.round(connectorRatio * 100)} % des paragraphes`,
    },
    {
      id: 'discourse',
      label: 'Marqueurs de discours (Pourtant, Cependant, Ainsi…)',
      value: mapLinear(per100(discourseMarkers), 0.25, 1.8),
      weight: 1.6,
      detail: `${discourseMarkers} occurrences`,
    },
    {
      id: 'cliches',
      label: 'Clichés de dissertation FR',
      value: mapLinear(per100(clicheWeighted), 0.2, 2.2),
      weight: 1.9,
    },
    {
      id: 'hedges',
      label: 'Verbes de prudence',
      value: mapLinear(per100(hedgeCount), 0.35, 2.4),
      weight: 1.3,
      detail: `${hedgeCount} occurrences`,
    },
    {
      id: 'lexicalVariety',
      label: 'Richesse lexicale (TTR)',
      value: mapInverse(ttr, 0.33, 0.62),
      weight: 0.8,
      detail: `TTR = ${ttr.toFixed(3)}, MATTR-50 = ${mattr50.toFixed(3)}`,
    },
    {
      id: 'repetition',
      label: 'Répétitions de n-grammes',
      value: clamp(Math.max(trigramRepeat / 0.18, bigramRepeat / 0.35)),
      weight: 0.7,
    },
    {
      id: 'llmMarkers',
      label: 'Densité de tournures LLM',
      value: mapLinear(per100(markers.weighted), 0.3, 3.0),
      weight: 1.2,
      detail: `${markers.hits.length} tournures distinctes`,
    },
    {
      id: 'ternary',
      label: 'Structures dialectiques',
      value: mapLinear(ternary, 0.5, 4),
      weight: 0.7,
      detail: `${ternary} détectées`,
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
    const { flags, score: local, reasons } = sentenceFlags(segment, source, markers, meanWords, stdWords);
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

  let verdictReason: string;
  if (forensics.score >= 0.6) verdictReason = 'Caractères invisibles ou homoglyphes détectés';
  else if (score >= 60 && substantial && paragraphIsomorphism >= 0.75 && paragraphs.length >= 4) verdictReason = 'Paragraphes calibrés : tous font 2 à 4 phrases de longueur presque identique';
  else if (score >= 60 && substantial && connectorRatio >= 0.4 && paragraphs.length >= 4) verdictReason = 'Structure dialectique synthétique : connecteurs en tête de paragraphe';
  else if (score >= 60 && substantial && enumSentenceRatio >= 0.25) verdictReason = 'Énumérations systématiques de trois éléments ou plus';
  else if (score >= 60) verdictReason = 'Rythme uniforme et tournures typiques des modèles';
  else if (score >= 35) verdictReason = 'Signaux mitigés, typiques d’un texte retouché';
  else verdictReason = 'Variation naturelle du rythme et du vocabulaire';

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
    components: components.map((c) => ({ id: c.id, label: c.label, value: Math.round(c.value * 1000) / 1000, weight: c.weight, detail: c.detail ?? null })),
  };
}
