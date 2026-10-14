/**
 * Image provenance tests.
 *
 * These build real container bytes around real metadata fields — the IPTC
 * digital source type, the C2PA action vocabulary, the platform labels Google
 * and Meta write — and check that the reading follows. No model, no fixture
 * binary: the point is that a declared fact is read as a declared fact.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyseImageFile } from '../src/imageAnalyzer';

const enc = new TextEncoder();

/** Only arrayBuffer/name/size/type are used before the decode step fails. */
const fakeFile = (bytes: Uint8Array, name: string, type: string): File =>
  ({
    name,
    size: bytes.length,
    type,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  }) as unknown as File;

/** A JPEG whose APP1 carries an XMP packet; the scanner reads it from the bytes. */
function jpegWithXmp(xmp: string): Uint8Array {
  const ns = enc.encode('http://ns.adobe.com/xap/1.0/\u0000');
  const body = enc.encode(xmp);
  const segLen = ns.length + body.length + 2;
  const out = new Uint8Array(6 + ns.length + body.length);
  out.set([0xff, 0xd8, 0xff, 0xe1, (segLen >> 8) & 0xff, segLen & 0xff], 0);
  out.set(ns, 6);
  out.set(body, 6 + ns.length);
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const len = data.length;
  out.set([(len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff], 0);
  out.set(enc.encode(type), 4);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + len));
  out.set([(crc >>> 24) & 0xff, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff, crc & 0xff], 8 + len);
  return out;
}

function pngWithText(chunks: Array<[string, string]>): Uint8Array {
  const bits: Uint8Array[] = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  bits.push(pngChunk('IHDR', new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])));
  for (const [key, value] of chunks) bits.push(pngChunk('tEXt', enc.encode(`${key}\u0000${value}`)));
  bits.push(pngChunk('IEND', new Uint8Array(0)));
  const total = bits.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const b of bits) { out.set(b, at); at += b.length; }
  return out;
}

const GOOGLE_XMP = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"
  xmlns:xmp="http://ns.adobe.com/xap/1.0/" Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia">
  <xmp:CreatorTool>Google Gemini (Imagen)</xmp:CreatorTool>
</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;

const META_XMP = `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"
  Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"
  Iptc4xmpExt:Label="Imagined with AI" />
</rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;

test('a Google SynthID/Imagen declaration is read as AI', async () => {
  const res = await analyseImageFile(fakeFile(jpegWithXmp(GOOGLE_XMP), 'imagen.jpg', 'image/jpeg'));
  assert.equal(res.verdict, 'ai');
  assert.ok(res.score >= 90, `score ${res.score}`);
  assert.ok(res.evidence.some((e) => e.id === 'iptc-trained-algorithmic'), 'IPTC evidence missing');
});

test('a Meta « Imagined with AI » file is read as AI', async () => {
  const res = await analyseImageFile(fakeFile(jpegWithXmp(META_XMP), 'meta.jpg', 'image/jpeg'));
  assert.equal(res.verdict, 'ai');
  assert.ok(res.evidence.some((e) => e.id === 'iptc-trained-algorithmic'));
  assert.ok(res.signatures.some((s) => s.id === 'meta-ai'), 'Meta label not matched');
});

test('the composite source type is distinguished from the plain one', async () => {
  const xmp = `<rdf:Description xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia" />`;
  const res = await analyseImageFile(fakeFile(jpegWithXmp(xmp), 'composite.jpg', 'image/jpeg'));
  assert.equal(res.verdict, 'ai');
  assert.ok(res.evidence.some((e) => e.id === 'iptc-composite-algorithmic'), 'composite evidence missing');
});

test('a C2PA signed workflow declaring AI generation is read as AI', async () => {
  const xmp = `<rdf:Description xmlns:xmp="http://ns.adobe.com/xap/1.0/">c2pa.claim c2pa.actions c2pa.created SynthID</rdf:Description>`;
  const res = await analyseImageFile(fakeFile(jpegWithXmp(xmp), 'signed.jpg', 'image/jpeg'));
  assert.equal(res.c2pa.present, true);
  assert.equal(res.c2pa.aiDeclared, true);
  assert.equal(res.verdict, 'ai');
});

test('a Stable Diffusion PNG is read as AI from its parameters chunk', async () => {
  const png = pngWithText([['parameters', 'a cat, steps: 30, sampler: DPM++ 2M, cfg scale: 7, negative prompt: blurry']]);
  const res = await analyseImageFile(fakeFile(png, 'sd.png', 'image/png'));
  assert.equal(res.verdict, 'ai');
  assert.ok(res.signatures.some((s) => s.id === 'stable-diffusion'));
});

test('a plain digital capture is not called AI', async () => {
  const xmp = `<rdf:Description xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture" />`;
  const res = await analyseImageFile(fakeFile(jpegWithXmp(xmp), 'photo.jpg', 'image/jpeg'));
  assert.notEqual(res.verdict, 'ai');
  assert.ok(res.evidence.some((e) => e.id === 'iptc-digital-capture'));
});

test('an algorithmic-enhancement tag is not an AI verdict on its own', async () => {
  const xmp = `<rdf:Description xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/algorithmicallyEnhanced" />`;
  const res = await analyseImageFile(fakeFile(jpegWithXmp(xmp), 'enhanced.jpg', 'image/jpeg'));
  assert.notEqual(res.verdict, 'ai');
});
