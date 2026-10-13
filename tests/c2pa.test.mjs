import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeCbor, toPlain } from '../src/core/cbor.js';
import { analyzeC2pa, findJumbfStore } from '../src/core/c2pa.js';
import { detectSynthid, detectGreenList, hashIV } from '../src/core/watermark.js';

/* ---- tiny CBOR encoder for fixtures -------------------------------------- */

function cborInt(n) {
  if (n < 24) return [n];
  if (n < 256) return [0x18, n];
  return [0x19, n >> 8, n & 0xff];
}
function cborEncode(v) {
  if (typeof v === 'string') {
    const b = [...new TextEncoder().encode(v)];
    if (b.length < 24) return [0x60 | b.length, ...b];
    if (b.length < 256) return [0x78, b.length, ...b];
    return [0x79, b.length >> 8, b.length & 0xff, ...b];
  }
  if (typeof v === 'number') return cborInt(v);
  if (v === true) return [0xf5];
  if (v === false) return [0xf4];
  if (v === null) return [0xf6];
  if (Array.isArray(v)) return [0x80 | v.length, ...v.flatMap(cborEncode)];
  if (v && typeof v === 'object') {
    const entries = Object.entries(v).flatMap(([k, val]) => [...cborEncode(k), ...cborEncode(val)]);
    return [0xa0 | Object.keys(v).length, ...entries];
  }
  throw new Error('unsupported');
}

const bytes = (arr) => new Uint8Array(arr);

/* ---- JUMBF fixture builder ---------------------------------------------- */

function box(type, payload) {
  const size = 8 + payload.length;
  return bytes([
    (size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff,
    ...[...type].map((c) => c.charCodeAt(0)),
    ...payload,
  ]);
}

function uuidBytes(tag) {
  // First four bytes are the ASCII tag; the remaining follow the C2PA suffix.
  const out = new Uint8Array(16);
  for (let i = 0; i < 4; i += 1) out[i] = tag.charCodeAt(i);
  [0x00, 0x11, 0x00, 0x10, 0x80, 0x00, 0x00, 0xaa, 0x00, 0x38, 0x9b, 0x71].forEach((b, i) => { out[i + 4] = b; });
  return out;
}

function jumd(tag, label) {
  const labelBytes = [...new TextEncoder().encode(label), 0];
  return box('jumd', bytes([...uuidBytes(tag), 0x03, ...labelBytes]));
}

function jumb(parts) {
  const payload = parts.flatMap((p) => [...p]);
  return box('jumb', bytes(payload));
}

function cborBox(obj) {
  return box('cbor', bytes(cborEncode(obj)));
}

function buildStore({ ai = true } = {}) {
  const actionObj = { action: 'c2pa.created', when: '2026-07-27T18:34:12Z' };
  if (ai) actionObj.digitalSourceType = 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia';
  actionObj.softwareAgent = 'gpt-image';

  const claim = {
    claim_generator_info: [{ name: 'OpenAI OpCo, LLC', version: '1.0' }],
    'dc:title': 'test',
    'dc:format': 'image/png',
  };

  const assertionStore = jumb([
    jumd('c2as', 'c2pa.assertions'),
    jumb([jumd('c2pa', 'c2pa.actions'), cborBox({ actions: [actionObj] })]),
    jumb([jumd('c2pa', 'c2pa.hash.data'), cborBox({ alg: 'sha256', hash: bytes([0, 1, 2]), exclusions: [] })]),
  ]);

  const manifest = jumb([
    jumd('c2ma', 'urn:c2pa:1234-5678'),
    assertionStore,
    jumb([jumd('c2cl', 'c2pa.claim'), cborBox(claim)]),
    jumb([jumd('c2cs', 'c2pa.signature'), cborBox({ dummy: true })]),
  ]);

  return jumb([jumd('c2pa', 'c2pa'), manifest]);
}

function wrapPng(store) {
  const sig = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const len = store.length;
  const chunk = bytes([
    (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff,
    ...[...'caBX'].map((c) => c.charCodeAt(0)),
    ...store,
    0, 0, 0, 0,
  ]);
  return bytes([...sig, ...chunk]);
}

/* ---- tests --------------------------------------------------------------- */

test('CBOR decoder round-trips strings, ints, arrays and maps', () => {
  const value = { a: 1, b: 'two', c: [1, 2, 3], d: { e: true } };
  const decoded = toPlain(decodeCbor(bytes(cborEncode(value))).value);
  assert.deepEqual(decoded, value);
});

test('findJumbfStore locates the PNG caBX chunk', () => {
  const png = wrapPng(buildStore());
  const found = findJumbfStore(png, 'png');
  assert.ok(found, 'store not found');
  assert.equal(found.container, 'png');
  assert.equal(String.fromCharCode(found.store[4], found.store[5], found.store[6], found.store[7]), 'jumb');
});

test('analyzeC2pa reports AI generation from trainedAlgorithmicMedia', () => {
  const r = analyzeC2pa(wrapPng(buildStore({ ai: true })), 'png');
  assert.equal(r.present, true);
  assert.equal(r.aiGenerated, true);
  assert.equal(r.issuer, 'OpenAI OpCo, LLC');
  assert.ok(r.actions.some((a) => a.action === 'c2pa.created'));
  assert.ok(r.digitalSourceTypes.some((t) => t.includes('trainedAlgorithmicMedia')));
  assert.ok(r.hardBinding);
});

test('analyzeC2pa does not flag a non-AI manifest', () => {
  const r = analyzeC2pa(wrapPng(buildStore({ ai: false })), 'png');
  assert.equal(r.present, true);
  assert.equal(r.aiGenerated, false);
});

test('analyzeC2pa abstains on a file with no manifest', () => {
  const r = analyzeC2pa(bytes([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6]), 'png');
  assert.equal(r.present, false);
});

test('hashIV is deterministic and key-dependent', () => {
  const a = hashIV([1, 2, 3], 5, 3, 1024);
  const b = hashIV([1, 2, 3], 5, 3, 1024);
  const c = hashIV([1, 2, 4], 5, 3, 1024);
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test('detectSynthid requires a key and otherwise abstains', () => {
  const none = detectSynthid([1, 2, 3, 4, 5, 6], null);
  assert.equal(none.available, false);
  assert.equal(none.reason, 'no-key');
});

test('detectSynthid returns a proper z-score on unwatermarked tokens', () => {
  const tokens = Array.from({ length: 2000 }, (_, i) => (i * 37) % 500);
  const r = detectSynthid(tokens, [1, 2, 3, 4, 5]);
  assert.equal(r.available, true);
  assert.ok(r.n > 0);
  assert.ok(Math.abs(r.z) < 5, `z ${r.z} should be near 0 for random tokens`);
  assert.equal(r.verdict, 'not-detected');
  assert.ok(r.pValue >= 0 && r.pValue <= 1);
});

test('detectSynthid is deterministic', () => {
  const tokens = Array.from({ length: 300 }, (_, i) => i % 97);
  const a = detectSynthid(tokens, [11, 22]);
  const b = detectSynthid(tokens, [11, 22]);
  assert.deepEqual(a, b);
});

test('detectGreenList needs a key and a long enough sequence', () => {
  assert.equal(detectGreenList([1, 2, 3], 42).available, false);
  const tokens = Array.from({ length: 500 }, (_, i) => i % 211);
  const r = detectGreenList(tokens, 42, { gamma: 0.25 });
  assert.equal(r.available, true);
  assert.ok(r.z >= -6 && r.z <= 6, `z ${r.z}`);
});
