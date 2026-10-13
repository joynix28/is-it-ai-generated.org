import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSlop, slopScore, deslop, SLOP_PATTERNS } from '../src/core/slop.js';

test('flags throat-clearing and binary contrasts', () => {
  const r = detectSlop("Here's the thing: the plan isn't the problem. The people are. Let that sink in.", { language: 'en' });
  const ids = r.findings.map((f) => f.id);
  assert.ok(ids.includes('throat-clearing'), ids.join(','));
  assert.ok(ids.includes('binary-contrast'), ids.join(','));
  assert.ok(r.score > 30, `score ${r.score}`);
});

test('clean prose scores low', () => {
  const clean = 'The team shipped the release on Tuesday. Deploy time dropped from forty minutes to four.';
  assert.ok(slopScore(clean, { language: 'en' }) < 25);
});

test('every pattern has the required fields', () => {
  for (const p of SLOP_PATTERNS) {
    assert.ok(p.id && p.label && p.hint && p.re instanceof RegExp, `bad pattern ${p.id}`);
    assert.ok(typeof p.weight === 'number');
  }
});

test('finding offsets are correct', () => {
  const text = 'Furthermore, the system is robust and comprehensive.';
  const r = detectSlop(text, { language: 'en' });
  for (const f of r.findings) {
    for (const m of f.matches) {
      assert.equal(text.slice(m.start, m.end), m.value);
    }
  }
});

test('regexes do not leak state between calls', () => {
  const t = 'Furthermore, moreover, additionally.';
  const a = detectSlop(t, { language: 'en' }).total;
  const b = detectSlop(t, { language: 'en' }).total;
  assert.equal(a, b);
});

test('deslop removes safe filler and reports changes', () => {
  const { text, changes } = deslop("Here's the thing: it is important to note that the build works.");
  assert.ok(!/here's the thing/i.test(text));
  assert.ok(!/important to note/i.test(text));
  assert.ok(changes.length > 0);
  assert.match(text, /^The build works\.$/i);
});
