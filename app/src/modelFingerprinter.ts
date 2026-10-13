/**
 * Model-origin fingerprinting.
 *
 * Every large model has stylistic habits, the way a writer has tells. This
 * module scores how much a text looks like the output of one family rather than
 * another: OpenAI, Google, Anthropic, Meta.
 *
 * Important framing, and the UI repeats it: these are statistical tendencies,
 * not attribution. Homes converge, all vendors ship several models, and the
 * differences are small. The output is a relative ranking, never a claim about
 * which product wrote something.
 *
 * Every score is computed from a named, measurable feature, and the evidence
 * list names them, so a reader can disagree with the reasoning rather than with
 * a black box.
 */

import { tokenize, splitSentences } from './segments';

export type FamilyId = 'openai' | 'google' | 'anthropic' | 'meta';

export interface FamilyProfile {
  id: FamilyId;
  label: string;
  /** 0..1 relative match. */
  score: number;
  evidence: string[];
}

export interface FingerprintResult {
  profiles: FamilyProfile[];
  /** Highest scoring family, or null when nothing stands out. */
  top: FamilyId | null;
  /** 0..1 how far the leader is ahead of the runner-up. */
  separation: number;
  /** True when the text is too short or too neutral to rank. */
  inconclusive: boolean;
  notes: string[];
}

const LABELS: Record<FamilyId, string> = {
  openai: 'OpenAI · ChatGPT / GPT-4o',
  google: 'Google · Gemini',
  anthropic: 'Anthropic · Claude',
  meta: 'Meta · Llama',
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Weighted sum normalised by total weight, so scores stay comparable. */
function blend(parts: Array<{ value: number; weight: number }>): number {
  const total = parts.reduce((sum, p) => sum + p.weight, 0);
  if (total === 0) return 0;
  return clamp01(parts.reduce((sum, p) => sum + p.value * p.weight, 0) / total);
}

const band = (value: number, lo: number, hi: number): number =>
  clamp01((value - lo) / (hi - lo));

const bandInverse = (value: number, lo: number, hi: number): number => 1 - band(value, lo, hi);

/** Shannon entropy of a categorical distribution, in bits. */
function entropy(counts: number[]): number {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  return -counts.reduce((sum, c) => {
    if (!c) return sum;
    const p = c / total;
    return sum + p * Math.log2(p);
  }, 0);
}

const OPENAI_VOCAB = [
  'crucial', 'cruciale', 'plongeons', 'tapisserie', 'catalyseur', 'nuancé', 'nuancée',
  'delve', 'tapestry', 'realm', 'pivotal', 'seamless', 'robust', 'comprehensive',
  'cutting-edge', 'game-changer', 'holistic', 'multifaceted', 'underscores',
];

const ANTHROPIC_TRANSITIONS = [
  'il convient de souligner', 'il convient de noter', 'à cet égard', 'force est de constater',
  'en ce sens', 'dans cette perspective', 'cela étant', 'à bien des égards',
  'it is worth noting', 'with that said', 'in this respect', 'to that end',
];

const GOOGLE_TRANSITIONS = [
  'however', 'moreover', 'furthermore', 'therefore', 'in addition', 'consequently',
  'toutefois', 'par ailleurs', 'en outre', 'de plus', 'par conséquent', 'néanmoins',
];

const SUBORDINATORS = [
  'qui', 'que', 'quand', 'lorsque', 'puisque', 'bien que', 'afin que', 'tandis que',
  'although', 'whereas', 'because', 'while', 'which', 'that',
];

const FIRST_PERSON = new Set([
  'je', 'j', 'moi', 'mon', 'ma', 'mes', 'nous', 'notre', 'nos',
  'i', 'me', 'my', 'we', 'our',
]);

interface Features {
  words: string[];
  sentences: string[];
  sentenceWordCounts: number[];
  paragraphs: string[];
  emDashes: number;
  oppositioPatterns: number;
  openaiVocab: number;
  anthropicTransitions: number;
  googleTransitions: number;
  transitionEntropy: number;
  boldBulletLines: number;
  bulletLines: number;
  totalLines: number;
  subordinators: number;
  commas: number;
  firstPerson: number;
  contractions: number;
  meanSentenceWords: number;
  sentenceCv: number;
  paragraphCv: number;
  exclamations: number;
  questions: number;
}

function extract(text: string): Features {
  const words = tokenize(text);
  const lower = words.map((w) => w.toLowerCase());
  const sentenceTexts = splitSentences(text, 'fr').map((s) => s.text);
  const sentenceWordCounts = sentenceTexts.map((s) => tokenize(s).length).filter((n) => n > 0);
  const paragraphs = text.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);
  const lines = text.split(/\n/);

  const count = (needle: string): number => {
    let total = 0;
    let cursor = 0;
    for (;;) {
      const at = text.toLowerCase().indexOf(needle, cursor);
      if (at === -1) break;
      total += 1;
      cursor = at + needle.length;
    }
    return total;
  };

  const meanSent = sentenceWordCounts.length
    ? sentenceWordCounts.reduce((a, b) => a + b, 0) / sentenceWordCounts.length
    : 0;
  const variance = sentenceWordCounts.length > 1
    ? sentenceWordCounts.reduce((a, n) => a + (n - meanSent) ** 2, 0) / (sentenceWordCounts.length - 1)
    : 0;
  const cv = meanSent > 0 ? Math.sqrt(variance) / meanSent : 0;

  const paragraphLengths = paragraphs.map((p) => tokenize(p).length).filter((n) => n > 0);
  const meanPara = paragraphLengths.length
    ? paragraphLengths.reduce((a, b) => a + b, 0) / paragraphLengths.length
    : 0;
  const paraVariance = paragraphLengths.length > 1
    ? paragraphLengths.reduce((a, n) => a + (n - meanPara) ** 2, 0) / (paragraphLengths.length - 1)
    : 0;
  const paraCv = meanPara > 0 ? Math.sqrt(paraVariance) / meanPara : 0;

  const transitionCounts = GOOGLE_TRANSITIONS.map((t) => count(t));
  const boldBullets = lines.filter((l) => /^\s*[-*•]\s+\*\*[^*]{2,60}\*\*\s*[:：]/.test(l)).length;

  const opposition =
    (text.match(/\bnon seulement\b[^.!?\n]{1,140}\bmais (?:aussi|également)\b/gi) ?? []).length +
    (text.match(/\bnot only\b[^.!?\n]{1,140}\bbut also\b/gi) ?? []).length +
    (text.match(/\bc['’]est (?:pas|n['’]est pas) [^.!?\n]{2,60}, c['’]est\b/gi) ?? []).length +
    (text.match(/\bit['’]s not [^.!?\n]{2,60}, it['’]s\b/gi) ?? []).length;

  return {
    words,
    sentences: sentenceTexts,
    sentenceWordCounts,
    paragraphs,
    emDashes: (text.match(/[\u2014\u2013]/g) ?? []).length,
    oppositioPatterns: opposition,
    openaiVocab: OPENAI_VOCAB.reduce((sum, w) => sum + count(w), 0),
    anthropicTransitions: ANTHROPIC_TRANSITIONS.reduce((sum, w) => sum + count(w), 0),
    googleTransitions: transitionCounts.reduce((a, b) => a + b, 0),
    transitionEntropy: entropy(transitionCounts.filter((c) => c > 0)),
    boldBulletLines: boldBullets,
    bulletLines: lines.filter((l) => /^\s*[-*•]\s+/.test(l)).length,
    totalLines: lines.filter((l) => l.trim()).length,
    subordinators: SUBORDINATORS.reduce((sum, w) => sum + count(` ${w} `), 0),
    commas: (text.match(/[,，]/g) ?? []).length,
    firstPerson: lower.filter((w) => FIRST_PERSON.has(w)).length,
    contractions: lower.filter((w) => w.includes("'") || w.includes('\u2019')).length,
    meanSentenceWords: meanSent,
    sentenceCv: cv,
    paragraphCv: paraCv,
    exclamations: (text.match(/!/g) ?? []).length,
    questions: (text.match(/\?/g) ?? []).length,
  };
}

/**
 * Score the four families.
 * @param text raw document
 */
export function fingerprint(text: string): FingerprintResult {
  const f = extract(text);
  const wordCount = f.words.length;
  const per100 = (n: number): number => (wordCount ? (n / wordCount) * 100 : 0);
  const sentenceCount = Math.max(1, f.sentences.length);

  const emDashPer100 = per100(f.emDashes);
  const openaiVocabPer100 = per100(f.openaiVocab);
  const commaPerSentence = f.commas / sentenceCount;
  const subordinatorRate = f.subordinators / sentenceCount;
  const contractionRate = wordCount ? f.contractions / wordCount : 0;
  const firstPersonRate = wordCount ? f.firstPerson / wordCount : 0;
  const boldBulletRatio = f.totalLines ? f.boldBulletLines / f.totalLines : 0;
  const bulletRatio = f.totalLines ? f.bulletLines / f.totalLines : 0;
  const listHeaviness = Math.max(boldBulletRatio * 1.4, bulletRatio);
  // Low entropy over transition words means the same few connectives repeat.
  const transitionUniformity = 1 - band(f.transitionEntropy, 0, 2.2);

  const evidence: Record<FamilyId, string[]> = { openai: [], google: [], anthropic: [], meta: [] };

  // --- OpenAI: em dashes, opposition structures, emphasis vocabulary -------
  if (emDashPer100 > 0.5) evidence.openai.push(`${emDashPer100.toFixed(1)} tirets cadratins / 100 mots`);
  if (f.oppositioPatterns > 0) evidence.openai.push(`${f.oppositioPatterns} structure(s) d'opposition`);
  if (f.openaiVocab > 0) evidence.openai.push(`vocabulaire d'emphase ×${f.openaiVocab}`);
  const openai = blend([
    { value: band(emDashPer100, 0.2, 1.6), weight: 1.5 },
    { value: Math.min(1, f.oppositioPatterns / 2), weight: 1.3 },
    { value: band(openaiVocabPer100, 0.1, 1.5), weight: 1.6 },
  ]);

  // --- Google: bulleted breakdowns, neutral encyclopedic tone, flat rhythm --
  if (boldBulletRatio > 0.15) evidence.google.push(`${(boldBulletRatio * 100).toFixed(0)} % de lignes en liste à intitulé gras`);
  if (firstPersonRate < 0.01 && wordCount > 60) evidence.google.push('quasi aucune marque de première personne');
  if (transitionUniformity > 0.6) evidence.google.push('connecteurs logiques répétitifs');
  if (bulletRatio > 0.25) evidence.google.push(`${(bulletRatio * 100).toFixed(0)} % de lignes en liste`);
  const google = blend([
    { value: band(listHeaviness, 0.15, 0.7), weight: 1.7 },
    { value: wordCount > 60 ? bandInverse(firstPersonRate, 0, 0.02) : 0.4, weight: 1.1 },
    { value: transitionUniformity, weight: 1.0 },
    { value: bandInverse(f.sentenceCv, 0.25, 0.65), weight: 0.9 },
    { value: bandInverse(contractionRate, 0.002, 0.02), weight: 0.7 },
  ]);

  // --- Anthropic: long articulated sentences, subordination, soft hedges ---
  if (subordinatorRate > 1.2) evidence.anthropic.push(`${subordinatorRate.toFixed(1)} subordonnées par phrase`);
  if (commaPerSentence > 3) evidence.anthropic.push(`${commaPerSentence.toFixed(1)} virgules par phrase`);
  if (f.anthropicTransitions > 0) evidence.anthropic.push(`transitions d'articulation ×${f.anthropicTransitions}`);
  const anthropic = blend([
    { value: band(f.meanSentenceWords, 20, 40), weight: 1.4 },
    { value: band(subordinatorRate, 0.6, 2.2), weight: 1.5 },
    { value: band(commaPerSentence, 2, 6), weight: 1.2 },
    { value: band(per100(f.anthropicTransitions), 0.1, 1.2), weight: 1.4 },
  ]);

  // --- Meta: short even paragraphs, symmetric, direct ----------------------
  if (f.paragraphCv < 0.35 && f.paragraphs.length >= 3) evidence.meta.push('paragraphes de longueur quasi identique');
  if (f.sentenceCv < 0.3 && f.sentences.length >= 5) evidence.meta.push('phrases de longueur très régulière');
  if (f.meanSentenceWords > 0 && f.meanSentenceWords < 18) evidence.meta.push(`phrases courtes (${f.meanSentenceWords.toFixed(0)} mots en moyenne)`);
  if (subordinatorRate < 0.9 && f.sentences.length >= 4) evidence.meta.push('peu de subordination');
  const meta = blend([
    { value: f.paragraphs.length >= 3 ? bandInverse(f.paragraphCv, 0.15, 0.6) : 0.35, weight: 1.5 },
    { value: f.sentences.length >= 5 ? bandInverse(f.sentenceCv, 0.2, 0.55) : 0.4, weight: 1.3 },
    { value: bandInverse(f.meanSentenceWords, 12, 26), weight: 1.1 },
    { value: bandInverse(subordinatorRate, 0.5, 1.8), weight: 1.0 },
    { value: bandInverse(firstPersonRate, 0.002, 0.02), weight: 0.5 },
  ]);

  const scores: Array<{ id: FamilyId; score: number }> = [
    { id: 'openai', score: openai },
    { id: 'google', score: google },
    { id: 'anthropic', score: anthropic },
    { id: 'meta', score: meta },
  ];
  scores.sort((a, b) => b.score - a.score);

  const notes: string[] = [];
  if (wordCount < 120) notes.push('fp.noteShort');
  if (f.exclamations + f.questions > 0) notes.push('fp.notePunctuation');
  if (/\b(?:je|j['’]|moi|nous)\b/i.test(text) && firstPersonRate > 0.015) {
    notes.push('fp.noteVoice');
  }

  const leader = scores[0];
  const runnerUp = scores[1];
  const separation = leader && runnerUp ? clamp01(leader.score - runnerUp.score) : 0;
  const inconclusive = wordCount < 60 || !leader || leader.score < 0.22 || separation < 0.04;

  return {
    profiles: scores.map(({ id, score }) => ({ id, label: LABELS[id], score, evidence: evidence[id] })),
    top: inconclusive || !leader ? null : leader.id,
    separation: Math.round(separation * 1000) / 1000,
    inconclusive,
    notes,
  };
}

/** i18n key. */
export const FINGERPRINT_DISCLAIMER = 'fingerprint.disclaimer';
