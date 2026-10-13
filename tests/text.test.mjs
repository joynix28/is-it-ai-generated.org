import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectText, fingerprint, compareTexts, DEFAULT_WEIGHTS } from '../src/core/index.js';

const HUMAN = "honestly i still can't believe we shipped that. the deploy broke twice, the tests were flaky, and i spent tuesday night on a call with the vendor arguing about a certificate. anyway it works now.";

const AI = "In today's fast-paced world, it is important to note that leveraging cutting-edge solutions plays a crucial role in modern organizations. Furthermore, a comprehensive approach facilitates robust outcomes. Moreover, organizations must navigate the complexities of an ever-evolving landscape. In conclusion, embracing innovation is a testament to organizational maturity.";

test('human text scores lower than AI text', () => {
  const human = detectText(HUMAN);
  const ai = detectText(AI);
  assert.ok(human.score < ai.score, `${human.score} should be < ${ai.score}`);
  assert.ok(human.score < 40, `human score ${human.score} should be low`);
  assert.ok(ai.score > 55, `ai score ${ai.score} should be high`);
});

test('verdicts map to score bands', () => {
  const ai = detectText(AI);
  assert.equal(ai.verdict, 'ai');
  assert.ok(['human', 'likely-human', 'uncertain'].includes(detectText(HUMAN).verdict));
});

test('report has the documented shape', () => {
  const r = detectText(AI);
  for (const key of ['score', 'verdict', 'confidence', 'language', 'fingerprint', 'reasons', 'sentences', 'slop', 'features']) {
    assert.ok(key in r, `missing ${key}`);
  }
  assert.equal(typeof r.score, 'number');
  assert.ok(r.score >= 0 && r.score <= 100);
  assert.ok(Array.isArray(r.sentences));
});

test('sentence offsets point into the original text', () => {
  const r = detectText(AI);
  for (const s of r.sentences) {
    assert.equal(AI.slice(s.start, s.end), s.text);
  }
});

test('fingerprint is stable and input-sensitive', () => {
  assert.equal(fingerprint(AI), fingerprint(AI));
  assert.notEqual(fingerprint(AI), fingerprint(HUMAN));
  assert.match(fingerprint(AI), /^[0-9a-f]{16}$/);
});

test('empty and tiny input do not crash', () => {
  for (const input of ['', '   ', 'hello', 'a. b? c!', '12345']) {
    const r = detectText(input);
    assert.ok(r.score >= 0 && r.score <= 100);
  }
  assert.equal(detectText('').wordCount, 0);
});

test('sensitivity shifts the score', () => {
  const low = detectText(AI, { sensitivity: 0.5 }).score;
  const high = detectText(AI, { sensitivity: 2 }).score;
  assert.ok(high >= low);
});

test('explicit language is respected', () => {
  const r = detectText('Bonjour tout le monde, comment allez-vous ?', { language: 'fr' });
  assert.equal(r.language, 'fr');
});

test('weights are all positive numbers', () => {
  for (const [k, v] of Object.entries(DEFAULT_WEIGHTS)) {
    assert.ok(typeof v === 'number' && v > 0, `weight ${k} invalid`);
  }
});

test('compareTexts finds identical passages', () => {
  const a = 'The quick brown fox jumps over the lazy dog near the river bank at dawn.';
  const b = 'The quick brown fox jumps over the lazy dog near the river bank at dusk.';
  const r = compareTexts(a, b);
  assert.ok(r.similarity > 50, `similarity ${r.similarity}`);
  assert.ok(compareTexts(a, 'completely different words about something else entirely here').similarity < 30);
});
