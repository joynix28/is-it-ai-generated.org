import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeImage, perceptualHashes, detectFormat, readMetadata } from '../src/core/index.js';
import { fft2dMagnitude, highFrequencyRatio, fft1d } from '../src/core/fft.js';

/** Build a synthetic RGBA image. */
function makePixels(width, height, fn) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = fn(x, y);
      const i = (y * width + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  }
  return data;
}

test('detectFormat recognises common headers', () => {
  assert.equal(detectFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
  assert.equal(detectFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
  assert.equal(detectFormat(new Uint8Array([0x47, 0x49, 0x46, 0x38])), 'gif');
  assert.equal(detectFormat(new Uint8Array([1, 2, 3, 4])), 'unknown');
});

test('readMetadata survives an empty buffer', () => {
  const m = readMetadata(new Uint8Array(0));
  assert.equal(m.format, 'unknown');
  assert.deepEqual(m.generatorSignatures, []);
});

test('readMetadata finds a PNG tEXt generator signature', () => {
  // Minimal PNG signature + one tEXt chunk (no CRC validation in the reader).
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const payload = new TextEncoder().encode('Software\0Stable Diffusion XL');
  const chunk = new Uint8Array(12 + payload.length);
  chunk[3] = 0; chunk[4] = 0; chunk[5] = 0; // length high bytes
  chunk[7] = payload.length;
  chunk.set(new TextEncoder().encode('tEXt'), 4);
  chunk.set(payload, 8);
  const bytes = new Uint8Array(sig.length + chunk.length);
  bytes.set(sig, 0);
  bytes.set(chunk, sig.length);
  const m = readMetadata(bytes);
  assert.equal(m.format, 'png');
  assert.ok(m.generatorSignatures.includes('stable diffusion'), m.generatorSignatures.join(','));
});

test('analyzeImage scores a generator-tagged file as AI', () => {
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const payload = new TextEncoder().encode('Comment\0Midjourney v6');
  const chunk = new Uint8Array(12 + payload.length);
  chunk[7] = payload.length;
  chunk.set(new TextEncoder().encode('tEXt'), 4);
  chunk.set(payload, 8);
  const bytes = new Uint8Array(sig.length + chunk.length);
  bytes.set(sig, 0);
  bytes.set(chunk, sig.length);
  const r = analyzeImage({ bytes });
  assert.equal(r.verdict, 'ai');
  assert.ok(r.score >= 90);
});

test('analyzeImage accepts raw pixels and returns signals + hashes', () => {
  const width = 64;
  const height = 64;
  const data = makePixels(width, height, (x, y) => [(x * 4) % 255, (y * 4) % 255, ((x + y) * 2) % 255]);
  const r = analyzeImage({ data, width, height });
  assert.ok(r.signals.length > 0);
  assert.ok(r.hashes && r.hashes.aHash.length > 0);
  assert.ok(r.score >= 0 && r.score <= 100);
});

test('perceptual hash is stable', () => {
  const data = makePixels(32, 32, (x, y) => [x * 8, y * 8, 128]);
  const a = perceptualHashes(data, 32, 32);
  const b = perceptualHashes(data, 32, 32);
  assert.deepEqual(a, b);
});

test('fft returns expected shape and a valid ratio', () => {
  const size = 8;
  const gray = new Float64Array(size * size).map((_, i) => (i % size) % 2 ? 1 : -1);
  const mag = fft2dMagnitude(gray, size);
  assert.equal(mag.length, size * size);
  const hf = highFrequencyRatio(mag, size, 0.5);
  assert.ok(hf >= 0 && hf <= 1, `hf ${hf}`);
});

test('fft1d inverts back to the original', () => {
  const data = new Float64Array([1, 0, 2, 0, 3, 0, 4, 0]);
  const copy = data.slice();
  fft1d(copy, false);
  fft1d(copy, true);
  for (let i = 0; i < data.length; i += 1) assert.ok(Math.abs(data[i] - copy[i]) < 1e-9);
});
