import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sha256Hex } from '../src/core/hash.js';
import { compressibility, compressibilityScore } from '../src/core/compress.js';

test('sha256 matches FIPS 180-4 vectors', () => {
  assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(
    sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  );
});

test('compressibility ratio is bounded and lower for repetitive text', () => {
  const random = Array.from({ length: 4000 }, () => Math.random().toString(36)[2] || 'a').join('');
  const repetitive = 'the system is robust and comprehensive. '.repeat(120);
  const r1 = compressibility(random).ratio;
  const r2 = compressibility(repetitive).ratio;
  assert.ok(r1 > 0 && r1 <= 1.5, `ratio ${r1}`);
  assert.ok(r2 < r1, `${r2} should be < ${r1}`);
  assert.ok(compressibilityScore(r2) > compressibilityScore(r1));
});
