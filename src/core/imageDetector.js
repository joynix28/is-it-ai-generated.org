/**
 * Image analysis.
 *
 * Layer order, strongest first:
 *   1. C2PA Content Credentials declaring AI generation.
 *   2. A generator signature in metadata (Stable Diffusion, Midjourney, …).
 *   3. The neural classifier (Community Forensics ViT-S/16), when the browser
 *      has run it and passed the result in.
 *   4. Provenance-only: no evidence at all.
 *
 * Surface statistics (spectrum, noise, channel correlation, edges, blockiness)
 * are reported for information but do NOT decide the verdict. An earlier
 * version let them score, which produced false positives on ordinary photos;
 * that was the wrong call and it is gone.
 *
 * With no evidence the verdict is `unknown`, not a number pulled from thin air.
 */

import { readMetadata } from './exif.js';
import { analyzeC2pa, c2paSummary } from './c2pa.js';
import { fft2dMagnitude, highFrequencyRatio, floorPow2 } from './fft.js';
import { mean, correlation, round } from './math.js';

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
  const m = sum / gray.length;
  for (let i = 0; i < gray.length; i += 1) gray[i] -= m;
  return gray;
}

function laplacianVariance(data, width, height) {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  const lum = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = (y * width + x) * 4;
      const v = 4 * lum(i) - (lum(i - 4) + lum(i + 4) + lum(i - width * 4) + lum(i + width * 4));
      sum += v;
      sumSq += v * v;
      n += 1;
    }
  }
  if (!n) return 0;
  const m = sum / n;
  return sumSq / n - m * m;
}

function edgeMagnitude(data, width, height) {
  const lum = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  let sum = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += 2) {
    for (let x = 1; x < width - 1; x += 2) {
      const i = (y * width + x) * 4;
      const gx = -lum(i - 4 - width * 4) + lum(i + 4 - width * 4) - 2 * lum(i - 4) + 2 * lum(i + 4)
        - lum(i - 4 + width * 4) + lum(i + 4 + width * 4);
      const gy = -lum(i - 4 - width * 4) - 2 * lum(i - width * 4) - lum(i + 4 - width * 4)
        + lum(i - 4 + width * 4) + 2 * lum(i + width * 4) + lum(i + 4 + width * 4);
      sum += Math.hypot(gx, gy);
      n += 1;
    }
  }
  return n ? sum / n / 1020 : 0;
}

function blockiness(data, width, height) {
  const lum = (i) => 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  let boundary = 0;
  let b = 0;
  let interior = 0;
  let ii = 0;
  for (let x = 8; x < width - 1; x += 8) {
    for (let y = 0; y < height; y += 4) { const i = (y * width + x) * 4; boundary += Math.abs(lum(i) - lum(i - 4)); b += 1; }
  }
  for (let x = 4; x < width - 1; x += 8) {
    for (let y = 0; y < height; y += 4) { const i = (y * width + x) * 4; interior += Math.abs(lum(i) - lum(i - 4)); ii += 1; }
  }
  const bm = b ? boundary / b : 0;
  const im = ii ? interior / ii : 1;
  return im === 0 ? 0 : bm / im;
}

function channelCorrelation(data) {
  const n = data.length / 4;
  if (n < 16) return 0;
  const r = [];
  const g = [];
  const bl = [];
  const step = Math.max(1, Math.floor(n / 20000));
  for (let i = 0; i < n; i += step) { r.push(data[i * 4]); g.push(data[i * 4 + 1]); bl.push(data[i * 4 + 2]); }
  return mean([Math.abs(correlation(r, g)), Math.abs(correlation(g, bl)), Math.abs(correlation(r, bl))]);
}

function saturationMean(data) {
  const n = data.length / 4;
  const step = Math.max(1, Math.floor(n / 20000));
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i += step) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    sum += max === 0 ? 0 : (max - min) / max;
    count += 1;
  }
  return count ? sum / count : 0;
}

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
    for (let x = 0; x < size - 1; x += 1) dBits += gray[y * size + x] > gray[y * size + x + 1] ? '1' : '0';
  }
  const binToHex = (bits) => {
    let hex = '';
    for (let i = 0; i < bits.length; i += 4) hex += parseInt(bits.slice(i, i + 4).padEnd(4, '0'), 2).toString(16);
    return hex;
  };
  return { aHash: binToHex(aBits), dHash: binToHex(dBits) };
}

/**
 * @param {{bytes?:Uint8Array, data?:Uint8ClampedArray|Uint8Array, width?:number, height?:number, mime?:string}} input
 * @param {{model?:{pAI:number, verdict:string, model:object, views:string[], logit:number}}} [options]
 */
export function analyzeImage(input = {}, options = {}) {
  const metadata = input.bytes
    ? readMetadata(input.bytes)
    : { format: input.mime || 'unknown', exif: {}, fields: [], c2pa: false, generatorSignatures: [], softwareSignatures: [] };

  const generatorFound = (metadata.generatorSignatures || []).length > 0;
  const softwareFound = (metadata.softwareSignatures || []).length > 0;
  const hasCamera = Boolean(metadata.camera);
  const hasExif = Boolean(metadata.hasMetadata);

  let c2pa = { present: false };
  if (input.bytes) {
    try { c2pa = c2paSummary(analyzeC2pa(input.bytes, metadata.format)); } catch (err) { c2pa = { present: false, error: err.message }; }
  }
  const c2paAI = Boolean(c2pa.aiGenerated);

  /* ---- evidence, strongest first ---- */
  const evidence = [];
  if (c2paAI) {
    evidence.push({ id: 'c2pa-ai', level: 'high', label: 'C2PA declares AI generation',
      detail: [c2pa.issuer, c2pa.claimGenerator].filter(Boolean).join(' · ') || null });
  } else if (c2pa.present) {
    evidence.push({ id: 'c2pa', level: 'info', label: 'C2PA manifest present',
      detail: c2pa.claimGenerator || c2pa.issuer || null });
  }
  if (generatorFound) {
    evidence.push({ id: 'generator', level: 'high', label: 'AI generator signature in metadata',
      detail: metadata.generatorSignatures.join(', ') });
  }
  if (hasCamera && !c2paAI && !generatorFound) {
    evidence.push({ id: 'camera', level: 'good', label: 'Camera metadata present',
      detail: [metadata.camera, metadata.exif.lensModel].filter(Boolean).join(' · ') });
  }
  if (softwareFound && !generatorFound) {
    evidence.push({ id: 'editor', level: 'info', label: 'Editing software tag', detail: metadata.softwareSignatures.join(', ') });
  }
  if (!c2pa.present && !generatorFound && !hasCamera && !hasExif) {
    evidence.push({ id: 'none', level: 'warn', label: 'No provenance metadata',
      detail: 'EXIF and Content Credentials were stripped. Almost every platform does this on upload, so it is not evidence of AI.' });
  }

  /* ---- surface statistics: informational only ---- */
  let surface = null;
  let hashes = null;
  if (input.data && input.width && input.height) {
    const { data, width, height } = input;
    const size = floorPow2(Math.min(256, Math.max(64, Math.min(width, height))));
    const mag = fft2dMagnitude(toGraySampled(data, width, height, size), size);
    surface = {
      highFrequencyRatio: round(highFrequencyRatio(mag, size, 0.5), 4),
      laplacianVariance: round(laplacianVariance(data, width, height), 1),
      channelCorrelation: round(channelCorrelation(data), 4),
      edgeMagnitude: round(edgeMagnitude(data, width, height), 5),
      saturation: round(saturationMean(data), 4),
      blockiness: round(blockiness(data, width, height), 4),
      note: 'Reported for reference. These do not determine the verdict.',
    };
    hashes = perceptualHashes(data, width, height);
  }

  /* ---- verdict ---- */
  const model = options.model || null;
  let score = null;
  let verdict = 'unknown';
  let confidence = 0;
  let source = 'none';

  if (c2paAI) {
    score = 96; verdict = 'ai'; confidence = 0.95; source = 'c2pa';
  } else if (generatorFound) {
    score = 93; verdict = 'ai'; confidence = 0.9; source = 'metadata';
  } else if (model) {
    score = Math.round(model.pAI * 100);
    verdict = model.verdict === 'real' ? 'real'
      : model.verdict === 'ai' ? 'ai'
        : model.verdict === 'likely-ai' ? 'likely-ai' : 'unsure';
    // A real camera plus a low model score is strong agreement.
    confidence = Math.max(0.35, Math.round(Math.abs(model.pAI - 0.5) * 2 * 90) / 100);
    source = 'model';
  } else if (hasCamera) {
    verdict = 'no-evidence'; source = 'metadata-only';
  } else {
    verdict = 'unknown'; source = 'none';
  }

  const nextStep = source === 'none' || source === 'metadata-only'
    ? 'Run the on-device model for a pixel-based reading.'
    : null;

  return {
    ok: true,
    version: 3,
    score,
    verdict,
    confidence: round(confidence, 2),
    source,
    evidence,
    nextStep,
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
    model,
    surface,
    hashes,
    dimensions: input.width ? { width: input.width, height: input.height } : null,
    disclaimer:
      'Provenance and a cross-generator classifier running on your device. Absence of a signal proves nothing, and any detector can be wrong.',
  };
}
