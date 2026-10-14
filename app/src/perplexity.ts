/**
 * The language-model juror, turned into a vote.
 *
 * The worker only runs the model; the arithmetic lives here so it can be tested
 * without loading half a gigabyte of weights.
 *
 * A model of this size does not measure authorship directly. What it measures is
 * predictability, and predictability tracks register as much as it tracks
 * origin: a well-written encyclopaedia article is as predictable as a good
 * chatbot answer, and a rushed note is less predictable than either. That is why
 * the model is never allowed to vote on its own.
 *
 * The way out is to make it prove itself first. It scores a hand-written anchor
 * and a machine-written anchor in the reader's language. Only if machine text is
 * clearly more predictable does it get a vote, and even then its vote is bounded
 * by the jury, never decisive.
 */

import type { NeuralReading } from './jury';

export interface PerplexityReport {
  /** Perplexity of the text being judged. */
  text: number;
  /** Perplexity of the hand-written calibration anchor. */
  human: number;
  /** Perplexity of the machine-written calibration anchor. */
  machine: number;
}

/** Machine text must be at least this much more predictable to earn a vote. */
const SEPARATION = 0.85;

const finite = (v: number): boolean => Number.isFinite(v) && v > 0;

export function toNeuralReading(report: PerplexityReport): NeuralReading {
  const { text, human, machine } = report;
  const detail: NeuralReading['detail'] = {
    key: 'jury.detail.ppl',
    params: { text: text.toFixed(0), human: human.toFixed(0), machine: machine.toFixed(0) },
  };

  if (!finite(text) || !finite(human) || !finite(machine)) {
    return { reading: 0, reliable: false, detail };
  }

  // Did the model separate the anchors at all in this language?
  if (machine >= human * SEPARATION) {
    return { reading: 0, reliable: false, detail };
  }

  // Lower perplexity than the machine anchor is stronger evidence than the
  // anchor itself; higher than the human anchor is beyond the human end.
  const reading = Math.max(0, Math.min(1, (human - text) / (human - machine)));
  return { reading, reliable: true, detail };
}
