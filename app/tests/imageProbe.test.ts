/**
 * Tests for the learned image probe.
 *
 * They pin the two things that could silently ruin the reading: that the
 * embedded coefficients are the published ones, and that the probe behaves the
 * way the published inference does (L2 normalise, dot, intercept, sigmoid,
 * threshold).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROBE_DIM,
  PROBE_INTERCEPT,
  PROBE_THRESHOLD,
  probeCoefficients,
  probeScore,
} from '../src/imageProbe';

test('the embedded coefficients are the published probe', () => {
  const w = probeCoefficients();
  assert.equal(w.length, PROBE_DIM);
  // First three weights, as decoded from the original model.npz.
  assert.ok(Math.abs(w[0]! - -0.2628030478954315) < 1e-6);
  assert.ok(Math.abs(w[1]! - -0.15895146131515503) < 1e-6);
  assert.ok(Math.abs(w[2]! - 0.5524832010269165) < 1e-6);
  // Sum and norm pin the whole vector, not just its head.
  let sum = 0;
  let squared = 0;
  for (const v of w) {
    sum += v;
    squared += v * v;
  }
  assert.ok(Math.abs(sum - 3.7853297718102112) < 1e-3, `sum ${sum}`);
  assert.ok(Math.abs(Math.sqrt(squared) - 20.57631598706484) < 1e-3, `norm ${Math.sqrt(squared)}`);
});

test('the published calibration constants are wired', () => {
  assert.ok(Math.abs(PROBE_INTERCEPT - 0.04680592939257622) < 1e-9);
  assert.ok(Math.abs(PROBE_THRESHOLD - 0.4582911431789398) < 1e-9);
});

test('a wrong-size embedding is refused, not scored', () => {
  assert.equal(probeScore(new Float32Array(10)), null);
  assert.equal(probeScore(new Float32Array(PROBE_DIM + 1)), null);
});

test('scaling the embedding does not change the reading', () => {
  const base = Array.from({ length: PROBE_DIM }, (_, i) => Math.sin(i * 0.7) * 3);
  const a = probeScore(base)!;
  const b = probeScore(base.map((v) => v * 1000))!;
  assert.ok(Math.abs(a.probability - b.probability) < 1e-9, `${a.probability} vs ${b.probability}`);
});

test('the reading moves in the direction of the weights', () => {
  const w = probeCoefficients();
  // Aligned with the probe: high. Opposite: low.
  const high = probeScore(Array.from(w))!;
  const low = probeScore(Array.from(w, (v) => -v))!;
  assert.ok(high.probability > 0.9, `aligned ${high.probability}`);
  assert.ok(low.probability < 0.1, `opposite ${low.probability}`);
  assert.equal(high.isAi, true);
  assert.equal(low.isAi, false);
});

test('a zero embedding sits exactly at the intercept', () => {
  const outcome = probeScore(new Float32Array(PROBE_DIM))!;
  const expected = 1 / (1 + Math.exp(-PROBE_INTERCEPT));
  assert.ok(Math.abs(outcome.probability - expected) < 1e-9, `${outcome.probability} vs ${expected}`);
});

test('the threshold is the decision line, not a rounded one', () => {
  // A vector just above and just below the threshold must disagree.
  const w = probeCoefficients();
  const scaleFor = (target: number): number[] => {
    // logit = intercept + scale * |w|, so scale picks the logit we want.
    const norm = Math.sqrt(Array.from(w).reduce((a, v) => a + v * v, 0));
    const targetLogit = Math.log(target / (1 - target));
    const scale = (targetLogit - PROBE_INTERCEPT) / norm;
    return Array.from(w, (v) => v * scale);
  };
  assert.equal(probeScore(scaleFor(0.60))!.isAi, true);
  assert.equal(probeScore(scaleFor(0.40))!.isAi, false);
});
