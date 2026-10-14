/**
 * The jury.
 *
 * A single score from a single method is the failure mode this project exists to
 * avoid. ZeroGPT-style tools print one number from one trained model, and the
 * number is wrong in a documented way: it flags formal human writing, because a
 * classifier trained on question-answer pairs learns register, not authorship.
 *
 * So the verdict is a jury of independent readings:
 *
 *   - rhythm and syntax   the shape of the sentences
 *   - formulaic language  stock phrases, hedges, enumerations, connectors
 *   - vocabulary          how surprising the word choices are
 *   - format signature    headings, lists, rules, a closing offer to continue
 *   - language model      perplexity under a small causal model, when it runs
 *
 * Each juror reports its own reading and its own weight, the consensus states how
 * much the jurors agree, and a juror that cannot demonstrate reliability abstains
 * instead of voting. The consensus never hides a disagreement: when the jurors
 * split, the verdict says so.
 */

import type { AnalysisResult, Band, Msg, ScoredComponent } from './types';

/** What the language-model juror returns, once it has run. */
export interface NeuralReading {
  /** 0..1, the share of evidence that the text is machine-written. */
  reading: number;
  /** False when the model could not be calibrated for this language. */
  reliable: boolean;
  /** i18n detail, for example the measured perplexity. */
  detail: Msg | null;
}

export interface Juror {
  id: string;
  /** i18n key. */
  label: string;
  /** 0..1. */
  reading: number;
  weight: number;
  /** True when this juror refused to vote. */
  abstained: boolean;
  detail: Msg | null;
}

export interface JuryVerdict {
  score: number;
  band: Band;
  confidence: number;
  jurors: Juror[];
  /** 1 = every juror agrees, 0 = they point in opposite directions. */
  agreement: number;
  /** Things the reader must know to read the verdict honestly. */
  caveats: Msg[];
}

/** The component groups, in the order they are shown. */
const GROUPS: ReadonlyArray<{ id: string; label: string; weight: number; members: readonly string[] }> = [
  { id: 'rhythm', label: 'jury.style', weight: 1.0, members: ['rhythm', 'paragraphIsomorphism', 'paragraphUniformity'] },
  { id: 'formula', label: 'jury.formula', weight: 1.0, members: ['cliches', 'llmMarkers', 'hedges', 'connectors', 'discourse', 'enumerations', 'ternary'] },
  { id: 'vocabulary', label: 'jury.lexicon', weight: 0.6, members: ['lexicalVariety', 'repetition'] },
  { id: 'format', label: 'jury.format', weight: 1.0, members: ['formattedShape', 'assistantCloser'] },
];

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

const bandFor = (score: number): Band => (score >= 60 ? 'ai' : score >= 35 ? 'mixed' : 'human');

/** Weighted mean of a group, ignoring components that are not applicable. */
function groupReading(byId: Map<string, ScoredComponent>, members: readonly string[]): { reading: number; detail: Msg | null } {
  let sum = 0;
  let total = 0;
  let strongest: ScoredComponent | null = null;
  for (const id of members) {
    const c = byId.get(id);
    if (!c || c.applicable === false) continue;
    sum += c.value * c.weight;
    total += c.weight;
    if (!strongest || c.value * c.weight > strongest.value * strongest.weight) strongest = c;
  }
  if (!total) return { reading: 0, detail: null };
  return { reading: clamp01(sum / total), detail: strongest?.detail ?? null };
}

/**
 * Judges the reading.
 *
 * The statistical engine stays the backbone: its calibration is the one that was
 * measured on the benchmark. The language-model juror can move the verdict, but
 * only inside a bounded range, so an unreliable model can never decide alone.
 * When it is reliable and disagrees sharply, the verdict dampens toward the
 * middle and says why.
 */
export function judge(res: AnalysisResult, neural?: NeuralReading): JuryVerdict {
  const byId = new Map(res.components.map((c) => [c.id, c]));

  const jurors: Juror[] = GROUPS.map((group) => {
    const { reading, detail } = groupReading(byId, group.members);
    return { id: group.id, label: group.label, reading, weight: group.weight, abstained: false, detail };
  });

  const neuralJuror: Juror = {
    id: 'neural',
    label: 'jury.neural',
    reading: neural ? neural.reading : 0,
    weight: 0.8,
    abstained: !neural || !neural.reliable,
    detail: neural?.detail ?? null,
  };
  jurors.push(neuralJuror);

  let score = res.score;
  const caveats: Msg[] = [];

  if (neural && neural.reliable) {
    // Bounded support: at most eight points, so the model corroborates or
    // tempers the statistical reading but never overrules it.
    let push = (neural.reading - 0.5) * 2;
    if (Math.abs(neural.reading * 100 - res.score) >= 40) {
      // The two disagree by a wide margin. Say so, and trust the engine that
      // was calibrated on the benchmark rather than the model that just showed
      // it reads register: halve its weight instead of averaging toward 50,
      // which would let the model flip the verdict on its own.
      caveats.push({ key: 'jury.caveat.disagree' });
      push *= 0.4;
    }
    score = Math.round(score + push * 8);
  } else if (neural && !neural.reliable) {
    caveats.push({ key: 'jury.caveat.abstain' });
  } else {
    caveats.push({ key: 'jury.caveat.noModel' });
  }

  if (res.stats.words < 60) caveats.push({ key: 'jury.caveat.short' });

  score = Math.max(0, Math.min(100, score));

  // Agreement is measured against the consensus on the voters that actually
  // voted. An abstention must not look like agreement.
  const voters = jurors.filter((j) => !j.abstained);
  const consensusReading = score / 100;
  const spread = voters.length
    ? voters.reduce((sum, j) => sum + Math.abs(j.reading - consensusReading), 0) / voters.length
    : 0;
  const agreement = clamp01(1 - spread * 1.6);

  // Confidence rises with length and with juror agreement, and falls when a
  // caveat says the reading is fragile.
  const lengthFactor = Math.min(1, res.stats.words / 250);
  const confidence = Math.round(
    clamp01(0.2 + lengthFactor * 0.5 + agreement * 0.3 - caveats.length * 0.06) * 100,
  );

  return { score, band: bandFor(score), confidence, jurors, agreement, caveats };
}
