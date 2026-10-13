/**
 * Local image forensics.
 *
 * Two layers, both computed on the device:
 *   1. Provenance metadata (EXIF / XMP / PNG chunks / C2PA).
 *   2. Pixel statistics: frequency spectrum, noise, channel correlation,
 *      edge uniformity, JPEG blockiness.
 *
 * Like the text detector this returns named signals with values, not a
 * black-box verdict, plus a perceptual hash for de-duplication.
 *
 * Browser usage: decode with a canvas and pass { data, width, height }.
 * Node usage: pass { bytes } for metadata, and pixel data if you have a decoder.
 */

import { readMetadata } from './exif.js';
import { analyzeC2pa, c2paSummary } from './c2pa.js';
import { fft2dMagnitude, highFrequencyRatio, floorPow2 } from './fft.js';
import { clamp, mapLinear, mapInverse, mean, correlation, round } from './math.js';

/** Downsample RGBA pixels to a size x size grayscale matrix (nearest neighbour). */
function toGraySampled(data, width, height, size) {
  const gray = new Float64Array(size * size);
  let sum = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sx = Math.min(width - 1, Math.floor((x / size) * width));
      const sy = Math.min(height - 1, Math.floor((y / size) * height));
      const i = (sy * width + sx) * 4;
      const v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      gray[y * size + x] = v;
      sum += v;
    }
  }
  // Remove the DC offset so the spectrum is about structure, not brightness.
  const m = sum / gray.length;
  for (let i = 0; i < gray.length; i += 1) gray[i] -= m;
  return gray;
}

/** Variance of the Laplacian — a sharpness/noise proxy. */
function laplacianVariance(data, width, height) {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * 4;
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const neighbors =
        0.299 * data[i - 4] + 0.587 * data[i - 3] + 0.114 * data[i - 2] +
        0.299 * data[i + 4] + 0.587 * data[i + 5] + 0.114 * data[i + 6] +
        0.299 * data[i - width * 4] + 0.587 * data[i - width * 4 + 1] + 0.114 * data[i - width * 4 + 2] +
        0.299 * data[i + width * 4] + 0.587 * data[i + width * 4 + 1] + 0.114 * data[i + width * 4 + 2];
      const v = 4 * lum - neighbors;
      sum += v;
      sumSq += v * v;
      n += 1;
    }
  }
  if (!n) return 0;
  const m = sum / n;
  return sumSq / n - m * m;
}

/** Mean absolute Sobel edge magnitude, a proxy for texture density. */
function edgeStats(data, width, height) {
  let sum = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const idx = (y * width + x) * 4;
      const gx =
        -1 * lum(data, idx - 4 - width * 4) + 1 * lum(data, idx + 4 - width * 4) +
        -2 * lum(data, idx - 4) + 2 * lum(data, idx + 4) +
        -1 * lum(data, idx - 4 + width * 4) + 1 * lum(data, idx + 4 + width * 4);
      const gy =
        -1 * lum(data, idx - 4 - width * 4) - 2 * lum(data, idx - width * 4) - 1 * lum(data, idx + 4 - width * 4) +
        1 * lum(data, idx - 4 + width * 4) + 2 * lum(data, idx + width * 4) + 1 * lum(data, idx + 4 + width * 4);
      sum += Math.hypot(gx, gy);
      n += 1;
    }
  }
  return n ? sum / n / 1020 : 0;
}

const lum = (data, i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

/** JPEG 8x8 blockiness: ratio of boundary gradient to interior gradient. */
function blockiness(data, width, height) {
  let boundary = 0;
  let interior = 0;
  let nb = 0;
  let ni = 0;
  for (let x = 8; x < width - 1; x += 8) {
    for (let y = 0; y < height; y += 4) {
      const i = (y * width + x) * 4;
      boundary += Math.abs(lum(data, i) - lum(data, i - 4));
      nb += 1;
    }
  }
  for (let x = 4; x < width - 1; x += 8) {
    for (let y = 0; y < height; y += 4) {
      const i = (y * width + x) * 4;
      interior += Math.abs(lum(data, i) - lum(data, i - 4));
      ni += 1;
    }
  }
  const b = nb ? boundary / nb : 0;
  const i2 = ni ? interior / ni : 1;
  return i2 === 0 ? 0 : b / i2;
}

/** Mean pairwise RGB correlation. */
function channelCorrelation(data) {
  const n = data.length / 4;
  if (n < 16) return 0;
  const r = [];
  const g = [];
  const b = [];
  const step = Math.max(1, Math.floor(n / 20000));
  for (let i = 0; i < n; i += step) {
    r.push(data[i * 4]);
    g.push(data[i * 4 + 1]);
    b.push(data[i * 4 + 2]);
  }
  return mean([Math.abs(correlation(r, g)), Math.abs(correlation(g, b)), Math.abs(correlation(r, b))]);
}

/** Saturation and brightness stats. */
function colorStats(data) {
  const n = data.length / 4;
  const step = Math.max(1, Math.floor(n / 20000));
  let satSum = 0;
  let brightSum = 0;
  let count = 0;
  for (let i = 0; i < n; i += step) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    satSum += max === 0 ? 0 : (max - min) / max;
    brightSum += (r + g + b) / 3;
    count += 1;
  }
  return { saturation: count ? satSum / count : 0, brightness: count ? brightSum / count : 0 };
}

/** Average hash + difference hash, returned as hex strings. */
export function perceptualHashes(data, width, height) {
  const size = 8;
  const gray = new Float64Array(size * size);
  let sum = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sx = Math.min(width - 1, Math.floor((x / size) * width));
      const sy = Math.min(height - 1, Math.floor((y / size) * height));
      const i = (sy * width + sx) * 4;
      const v = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      gray[y * size + x] = v;
      sum += v;
    }
  }
  const avg = sum / (size * size);
  let aBits = '';
  for (let i = 0; i < size * size; i += 1) aBits += gray[i] > avg ? '1' : '0';

  let dBits = '';
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      dBits += gray[y * size + x] > gray[y * size + x + 1] ? '1' : '0';
    }
  }
  return { aHash: binToHex(aBits), dHash: binToHex(dBits) };
}

function binToHex(bits) {
  let hex = '';
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4).padEnd(4, '0'), 2).toString(16);
  }
  return hex;
}

/**
 * Analyse an image.
 * @param {{bytes?:Uint8Array, data?:Uint8ClampedArray|Uint8Array, width?:number, height?:number, mime?:string, reencode?:Function}} input
 * @param {{generatorOverride?:boolean}} [options]
 */
export function analyzeImage(input = {}, options = {}) {
  const signals = [];
  let metadata = null;

  if (input.bytes) {
    metadata = readMetadata(input.bytes);
  } else {
    metadata = { format: input.mime || 'unknown', exif: {}, fields: [], c2pa: false, generatorSignatures: [], softwareSignatures: [] };
  }

  const generatorFound = (metadata.generatorSignatures || []).length > 0;
  const softwareFound = (metadata.softwareSignatures || []).length > 0;
  const hasCamera = Boolean(metadata.camera);
  const hasExif = Boolean(metadata.hasMetadata);

  // C2PA / Content Credentials: the strongest provenance signal when present.
  let c2pa = { present: false };
  if (input.bytes) {
    try {
      c2pa = c2paSummary(analyzeC2pa(input.bytes, metadata.format));
    } catch (err) {
      c2pa = { present: false, error: err.message };
    }
  }
  const c2paAI = Boolean(c2pa.aiGenerated);

  const add = (id, label, value, weight, detail) =>
    signals.push({ id, label, value: clamp(value, 0, 1), weight, detail });

  // ---- Metadata signals ---------------------------------------------------
  if (generatorFound) {
    add('generator', 'AI generator signature', 1, 6,
      `Matched: ${metadata.generatorSignatures.join(', ')}`);
  }
  if (metadata.c2pa) {
    add('c2pa', 'C2PA / Content Credentials', c2paAI ? 1 : 0.5, c2paAI ? 6 : 2,
      c2pa.present
        ? `${c2pa.aiGenerated ? 'AI generation declared' : 'Manifest present'}${c2pa.issuer ? ` — ${c2pa.issuer}` : ''}`
        : 'Manifest bytes detected but not parsed.');
  }
  add('no-camera', 'No camera metadata', hasCamera ? 0 : hasExif ? 0.3 : 0.6, 1,
    hasCamera ? `Camera: ${metadata.camera}` : hasExif ? 'EXIF present without camera fields.' : 'No EXIF block found.');
  if (softwareFound) {
    add('editor-software', 'Editing software tag', 0.35, 0.8, `Matched: ${metadata.softwareSignatures.join(', ')}`);
  }

  // ---- Pixel signals ------------------------------------------------------
  let pixelSignals = 0;
  let hashes = null;
  if (input.data && input.width && input.height) {
    const { data, width, height } = input;
    const size = floorPow2(Math.min(256, Math.max(64, Math.min(width, height))));
    const gray = toGraySampled(data, width, height, size);
    const mag = fft2dMagnitude(gray, size);
    const hf = highFrequencyRatio(mag, size, 0.5);
    const lap = laplacianVariance(data, width, height);
    const edges = edgeStats(data, width, height);
    const block = blockiness(data, width, height);
    const chan = channelCorrelation(data);
    const colors = colorStats(data);
    hashes = perceptualHashes(data, width, height);

    // AI images often show an unusually high high-frequency energy OR an
    // unnaturally smooth surface. We score both ends.
    add('spectrum', 'High-frequency spectrum', mapLinear(hf, 0.55, 0.95, 0, 1), 1.4,
      `HF energy ratio ${round(hf, 3)}`);
    add('smoothness', 'Surface noise', mapInverse(lap, 8, 600, 0, 1), 1.3,
      `Laplacian variance ${round(lap, 1)}`);
    add('channel-correlation', 'Channel correlation', mapLinear(chan, 0.88, 0.995, 0, 1), 0.8,
      `Mean RGB correlation ${round(chan, 3)}`);
    add('edge-uniformity', 'Edge uniformity', mapInverse(edges, 0.02, 0.16, 0, 1), 0.7,
      `Mean edge magnitude ${round(edges, 4)}`);
    add('saturation', 'Color saturation', mapLinear(colors.saturation, 0.35, 0.75, 0, 1), 0.4,
      `Mean saturation ${round(colors.saturation, 3)}`);
    add('blockiness', 'JPEG blockiness', mapInverse(block, 1.05, 1.6, 0, 1), 0.3,
      `Block-edge ratio ${round(block, 3)}`);
    pixelSignals = 6;
  }

  const pixelComponents = signals.filter((s) => s.id !== 'generator' && s.id !== 'c2pa' && s.id !== 'no-camera' && s.id !== 'editor-software');
  const weightSum = pixelComponents.reduce((a, s) => a + s.weight, 0) || 1;
  const base = pixelComponents.reduce((a, s) => a + s.value * s.weight, 0) / weightSum;

  let score = Math.round(clamp(base, 0, 1) * 100);
  // Real cameras push the score down hard.
  if (hasCamera && !generatorFound) score = Math.round(score * 0.55);
  if (!pixelSignals) score = 40; // metadata-only: stay neutral.

  let verdict = 'uncertain';
  if (c2paAI) {
    score = Math.max(score, 96);
    verdict = 'ai';
  } else if (generatorFound) {
    score = Math.max(score, 93);
    verdict = 'ai';
  } else if (metadata.c2pa && !hasCamera) {
    score = Math.max(score, 82);
    verdict = 'likely-ai';
  } else {
    if (score < 30) verdict = 'likely-real';
    else if (score < 55) verdict = 'uncertain';
    else if (score < 75) verdict = 'likely-ai';
    else verdict = 'ai';
  }

  const confidence = round(
    clamp((pixelSignals ? 0.6 : 0.25) + (generatorFound || hasCamera ? 0.35 : 0) + (input.width > 200 ? 0.1 : 0), 0.1, 0.95),
    2,
  );

  return {
    ok: true,
    version: 2,
    score: clamp(score, 0, 100),
    verdict,
    confidence,
    metadata: {
      format: metadata.format,
      hasExif,
      hasCamera,
      camera: metadata.camera || null,
      software: metadata.software || null,
      generatorSignatures: metadata.generatorSignatures || [],
      softwareSignatures: metadata.softwareSignatures || [],
      c2pa: metadata.c2pa,
      fields: metadata.fields || [],
      exif: metadata.exif || {},
    },
    c2pa: {
      present: Boolean(c2pa.present),
      aiGenerated: c2paAI,
      container: c2pa.container || null,
      claimGenerator: c2pa.claimGenerator || null,
      issuer: c2pa.issuer || null,
      signer: c2pa.signer || null,
      algorithm: c2pa.algorithm || null,
      chainLength: c2pa.chainLength || 0,
      signaturePresent: Boolean(c2pa.signaturePresent),
      actions: c2pa.actions || [],
      digitalSourceTypes: c2pa.digitalSourceTypes || [],
      assertions: c2pa.assertions || [],
      hardBinding: c2pa.hardBinding || null,
      error: c2pa.error || null,
    },
    watermark: {
      available: false,
      reason: 'needs-decoder',
      note: 'SynthID-image and Stable Signature (Content Seal) need a neural decoder. Content Seal ships public extractor weights and can run through onnxruntime-web; SynthID-image does not distribute its model.',
    },
    hashes,
    dimensions: input.width ? { width: input.width, height: input.height } : null,
    signals,
    disclaimer:
      'Local heuristic analysis of metadata and pixel statistics. It is not a forensic proof and can be wrong.',
  };
}
