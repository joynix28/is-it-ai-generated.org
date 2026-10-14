/**
 * Tests for the jury and the language-model vote.
 *
 * These pin the property that matters most: the model can never decide alone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyse } from '../src/analyzer';
import { judge } from '../src/jury';
import { toNeuralReading } from '../src/perplexity';

const AI_DISSERTATION = [
  "À l'ère du numérique, il est important de noter que les solutions innovantes jouent un rôle crucial dans les organisations modernes.",
  "De plus, une approche globale facilite des résultats robustes et mesurables, ainsi qu'une meilleure compréhension des enjeux.",
  "Par ailleurs, les équipes doivent naviguer dans les complexités d'un environnement en constante évolution.",
  "En conclusion, l'innovation témoigne de la maturité de l'organisation et ouvre la voie à un avenir prometteur.",
].join('\n\n');

test('a model that cannot separate its anchors abstains', () => {
  const reading = toNeuralReading({ text: 800, human: 900, machine: 880 });
  assert.equal(reading.reliable, false);
});

test('a model that separates its anchors votes', () => {
  // Machine anchor far more predictable than the human anchor.
  const reading = toNeuralReading({ text: 400, human: 6000, machine: 1500 });
  assert.equal(reading.reliable, true);
  assert.ok(reading.reading > 0.5 && reading.reading <= 1, `reading ${reading.reading}`);
  // A text as predictable as the human anchor is a human vote.
  const human = toNeuralReading({ text: 6000, human: 6000, machine: 1500 });
  assert.ok(human.reading < 0.05, `reading ${human.reading}`);
});

test('the model can never flip a human verdict on its own', () => {
  const res = analyse(
    "Le train était encore en retard. J'ai attendu vingt minutes sous la pluie. Ma voisine m'a prêté son parapluie. Je suis arrivé trempé, personne n'a rien vu.",
    'fr',
  );
  const withoutModel = judge(res).score;
  const withModel = judge(res, { reading: 1, reliable: true, detail: null }).score;
  // Bounded support: at most a nudge, never a reversal.
  assert.equal(withModel - withoutModel <= 10, true, `moved by ${withModel - withoutModel}`);
  assert.equal(judge(res, { reading: 1, reliable: true, detail: null }).band, 'human');
});

test('the model can never flip an AI verdict on its own', () => {
  const res = analyse(AI_DISSERTATION, 'fr');
  const verdict = judge(res, { reading: 0, reliable: true, detail: null });
  assert.equal(verdict.score >= 60, true, `score ${verdict.score}`);
  assert.equal(verdict.band, 'ai');
});

test('a wide disagreement dampens the verdict and says so', () => {
  const res = analyse(AI_DISSERTATION, 'fr');
  const verdict = judge(res, { reading: 0, reliable: true, detail: null });
  assert.ok(verdict.caveats.some((c) => c.key === 'jury.caveat.disagree'));
  assert.ok(verdict.score < res.score, `${verdict.score} !< ${res.score}`);
});

test('an abstention is reported and does not count as agreement', () => {
  const res = analyse(AI_DISSERTATION, 'fr');
  const verdict = judge(res, { reading: 0, reliable: false, detail: null });
  assert.ok(verdict.caveats.some((c) => c.key === 'jury.caveat.abstain'));
  const neuralJuror = verdict.jurors.find((j) => j.id === 'neural');
  assert.equal(neuralJuror?.abstained, true);
});

test('without the model the verdict is the statistical engine, unchanged', () => {
  const res = analyse(AI_DISSERTATION, 'fr');
  const verdict = judge(res);
  assert.equal(verdict.score, res.score);
  assert.ok(verdict.caveats.some((c) => c.key === 'jury.caveat.noModel'));
});

test('the jury always reports every juror', () => {
  const res = analyse(AI_DISSERTATION, 'fr');
  const verdict = judge(res);
  for (const id of ['rhythm', 'formula', 'vocabulary', 'format', 'neural']) {
    assert.ok(verdict.jurors.some((j) => j.id === id), `missing juror ${id}`);
  }
});
