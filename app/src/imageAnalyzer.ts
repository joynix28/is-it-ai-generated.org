/**
 * Image forensics, entirely in the browser.
 *
 * Layer 1 reads the bytes: C2PA / JUMBF manifests, PNG and WebP text chunks,
 * EXIF, XMP, and the signatures that diffusion tools leave behind. When a signed
 * manifest declares AI generation, or a generator signature is present, that is
 * decisive and nothing else matters.
 *
 * Layer 2 reads the pixels when the metadata has been stripped (screenshots,
 * social networks). It computes three things that are weak but real:
 *   - high-pass noise consistency (Laplacian variance per 8x8 block)
 *   - chromatic aberration along strong edges (Sobel)
 *   - a high-frequency heatmap the user can overlay
 *
 * Everything is honest about its strength: bytes are evidence, pixels are an
 * indication. No network, no worker, no dependencies.
 */

export type ImageVerdict = 'ai' | 'likely-ai' | 'unsure' | 'likely-real' | 'real' | 'unknown';

export interface ImageEvidence {
  id: string;
  level: 'high' | 'good' | 'info' | 'warn';
  /** i18n key for the heading. */
  labelKey: string;
  /** Values interpolated into the heading. */
  labelParams?: Record<string, string | number>;
  /** i18n key for the sub-line when it is prose. */
  detailKey?: string | null;
  detailParams?: Record<string, string | number>;
  /** Sub-line shown verbatim (brand names, numbers) when it is not prose. */
  detailText?: string | null;
}

export interface C2paSummary {
  present: boolean;
  container: string | null;
  issuers: string[];
  aiDeclared: boolean;
  manifestBytes: number;
}

export interface SignatureHit {
  id: string;
  label: string;
  detail: string;
}

export interface CameraInfo {
  make: string | null;
  model: string | null;
  lens: string | null;
  iso: string | null;
  fNumber: string | null;
  exposure: string | null;
  focalLength: string | null;
  software: string | null;
  hasOptics: boolean;
}

export interface BenfordReport {
  /** Observed leading-digit distribution, digits 1..9 as fractions. */
  observed: number[];
  /** Benford's law: log10(1 + 1/d). */
  expected: number[];
  /** Kullback-Leibler divergence, bits. */
  kl: number;
  chiSquare: number;
  /** 1 = follows Benford closely, 0 = violates it strongly. */
  conformity: number;
  samples: number;
}

export interface PixelReport {
  laplacianMean: number;
  laplacianStd: number;
  blockUniformity: number;
  chromaticAberration: number;
  edgeDensity: number;
  heatmap: HTMLCanvasElement;
  benford: BenfordReport | null;
  sampleWidth: number;
  sampleHeight: number;
}

export interface ImageAnalysis {
  name: string;
  bytes: number;
  mime: string;
  format: string;
  width: number | null;
  height: number | null;
  c2pa: C2paSummary;
  signatures: SignatureHit[];
  camera: CameraInfo;
  rawMetadata: Array<{ key: string; value: string; keyIsI18n: boolean }>;
  diffusionGeometry: boolean;
  pixels: PixelReport | null;
  score: number;
  verdict: ImageVerdict;
  evidence: ImageEvidence[];
  ms: number;
}

/* ------------------------------------------------------------- utilities */

const ascii = (b: Uint8Array, o: number, n: number): string => {
  let s = '';
  for (let i = 0; i < n && o + i < b.length; i += 1) s += String.fromCharCode(b[o + i]!);
  return s;
};

const latin1 = (b: Uint8Array, from: number, to: number): string => {
  let s = '';
  for (let i = from; i < Math.min(to, b.length); i += 1) s += String.fromCharCode(b[i]!);
  return s;
};

const u32be = (b: Uint8Array, o: number): number =>
  ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;

const u32le = (b: Uint8Array, o: number): number =>
  (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

const u16be = (b: Uint8Array, o: number): number => ((b[o]! << 8) | b[o + 1]!) >>> 0;

const u16le = (b: Uint8Array, o: number): number => (b[o]! | (b[o + 1]! << 8)) >>> 0;

function detectFormat(b: Uint8Array): string {
  if (b.length < 12) return 'unknown';
  if (b[0] === 0xff && b[1] === 0xd8) return 'jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e) return 'png';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'webp';
  if (ascii(b, 4, 4) === 'ftyp') {
    const brand = ascii(b, 8, 4);
    if (/avif|avis/i.test(brand)) return 'avif';
    if (/heic|heix|mif1|msf1|hevc/i.test(brand)) return 'heif';
    return 'isobmff';
  }
  return 'unknown';
}

/* --------------------------------------------------------------- EXIF/IFD */

interface TiffTag {
  name: string;
  value: string;
}

const EXIF_NAMES: Record<number, string> = {
  0x010f: 'Make', 0x0110: 'Model', 0x0112: 'Orientation', 0x0131: 'Software',
  0x0132: 'DateTime', 0x013b: 'Artist', 0x8298: 'Copyright', 0x829a: 'ExposureTime',
  0x829d: 'FNumber', 0x8827: 'ISO', 0x9003: 'DateTimeOriginal', 0x920a: 'FocalLength',
  0xa433: 'LensMake', 0xa434: 'LensModel', 0xa430: 'OwnerName', 0xa432: 'LensSpec',
};

function parseTiff(b: Uint8Array, start: number): TiffTag[] {
  const tags: TiffTag[] = [];
  if (start + 8 > b.length) return tags;
  const endian = ascii(b, start, 2);
  const little = endian === 'II';
  const u16 = little ? u16le : u16be;
  const u32 = little ? u32le : u32be;
  if (u16(b, start + 2) !== 0x002a) return tags;

  let ifd = start + u32(b, start + 4);
  let guard = 0;
  while (ifd > start && ifd + 2 < b.length && guard < 4) {
    guard += 1;
    const count = u16(b, ifd);
    for (let i = 0; i < count; i += 1) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > b.length) break;
      const tag = u16(b, entry);
      const type = u16(b, entry + 2);
      const num = u32(b, entry + 4);
      const name = EXIF_NAMES[tag];
      if (!name) continue;

      const sizeOf = type === 3 ? 2 : type === 4 ? 4 : 1;
      const total = num * sizeOf;
      const inline = total <= 4;
      const valueOffset = inline ? entry + 8 : start + u32(b, entry + 8);
      if (valueOffset >= b.length) continue;

      if (type === 2) {
        const raw = latin1(b, valueOffset, valueOffset + Math.min(num, 256)).replace(/\0.*$/, '').trim();
        if (raw) tags.push({ name, value: raw });
      } else if (type === 3) {
        const value = u16(b, valueOffset);
        if (name === 'ISO') tags.push({ name, value: String(value) });
        if (name === 'Orientation') tags.push({ name, value: String(value) });
      } else if (type === 4) {
        const value = u32(b, valueOffset);
        tags.push({ name, value: String(value) });
      } else if (type === 5) {
        const numerator = u32(b, valueOffset);
        const denominator = u32(b, valueOffset + 4) || 1;
        tags.push({ name, value: `${numerator}/${denominator}` });
      }
    }
    const next = ifd + 2 + count * 12;
    if (next + 4 > b.length) break;
    const nextOffset = u32(b, next);
    if (!nextOffset) break;
    ifd = start + nextOffset;
  }
  return tags;
}

/* --------------------------------------------------------- byte scanners */

const AI_GENERATORS: ReadonlyArray<{ id: string; label: string; needles: string[] }> = [
  { id: 'stable-diffusion', label: 'Stable Diffusion', needles: ['parameters', 'negative prompt', 'steps:', 'sampler:', 'cfg scale', 'denoising strength'] },
  { id: 'comfyui', label: 'ComfyUI', needles: ['comfyui', '"workflow"', 'ksampler'] },
  { id: 'automatic1111', label: 'AUTOMATIC1111', needles: ['automatic1111', 'a1111', 'stable-diffusion-webui'] },
  { id: 'midjourney', label: 'Midjourney', needles: ['midjourney', 'job id'] },
  { id: 'flux', label: 'FLUX', needles: ['flux.1', 'black forest labs', 'flux1'] },
  { id: 'dalle', label: 'OpenAI DALL·E / GPT Image', needles: ['dall-e', 'dall·e', 'gpt-image', 'openai opco', 'openai'] },
  { id: 'imagen', label: 'Google Imagen / Gemini', needles: ['imagen', 'google llc', 'synthid', 'gemini'] },
  { id: 'meta-ai', label: 'Meta AI / Imagine', needles: ['meta ai', 'meta platforms', 'imagined with ai', 'imaginedwithai'] },
  { id: 'firefly', label: 'Adobe Firefly', needles: ['firefly', 'adobe firefly', 'generative fill'] },
  { id: 'designer', label: 'Microsoft Designer', needles: ['microsoft designer', 'bing image creator'] },
  { id: 'ideogram', label: 'Ideogram', needles: ['ideogram'] },
  { id: 'leonardo', label: 'Leonardo.Ai', needles: ['leonardo.ai', 'leonardo ai'] },
  { id: 'ai-label', label: 'AI-generated', needles: ['ai-generated content', 'generated with ai', 'created with ai', 'made with ai', 'ai info'] },
];

const EDITOR_SOFTWARE: ReadonlyArray<{ label: string; needles: string[] }> = [
  { label: 'Adobe Photoshop', needles: ['photoshop', 'adobe photoshop'] },
  { label: 'Adobe Lightroom', needles: ['lightroom'] },
  { label: 'GIMP', needles: ['gimp'] },
  { label: 'Affinity', needles: ['affinity'] },
  { label: 'Capture One', needles: ['capture one'] },
  { label: 'Snapseed', needles: ['snapseed'] },
];

const C2PA_ISSUERS: ReadonlyArray<{ label: string; needles: string[] }> = [
  { label: 'OpenAI', needles: ['openai', 'gpt-image', 'dall'] },
  { label: 'Google', needles: ['google', 'imagen', 'synthid', 'deepmind'] },
  { label: 'Meta', needles: ['meta platforms', 'meta ai'] },
  { label: 'Adobe', needles: ['adobe', 'firefly'] },
  { label: 'Microsoft', needles: ['microsoft'] },
  { label: 'Truepic', needles: ['truepic'] },
  { label: 'Leica', needles: ['leica'] },
  { label: 'Nikon', needles: ['nikon'] },
  { label: 'Sony', needles: ['sony'] },
  { label: 'Canon', needles: ['canon'] },
];

/**
 * IPTC digital source type.
 *
 * This is the interoperable field: `Iptc4xmpExt:DigitalSourceType`, defined by
 * IPTC and written by Google, Meta, OpenAI and Adobe. Its value comes from a
 * controlled vocabulary, so `trainedAlgorithmicMedia` means "produced by a
 * trained model" in every tool that reads it. No guessing, no heuristic, no
 * model to download: a declared fact.
 *
 * It travels in three places, and often without any C2PA manifest: the XMP
 * packet, the `c2pa.actions` assertion, and PNG text chunks. Google's SynthID
 * pipeline and Meta's "Imagined with AI" labeller both set it, so it is the one
 * signal that speaks for the platforms named in the brief.
 *
 * Order matters: `compositeWithTrainedAlgorithmicMedia` contains
 * `trainedAlgorithmicMedia`, so the composite must be tested first.
 *
 * `value` is the controlled-vocabulary token itself, identical in every
 * language: only the sentence around it is translated.
 */
const DIGITAL_SOURCE_TYPES: ReadonlyArray<{
  id: string;
  needle: string;
  value: string;
  level: 'high' | 'good' | 'info' | 'warn';
  ai: boolean;
}> = [
  { id: 'composite-algorithmic', needle: 'compositewithtrainedalgorithmicmedia', value: 'compositeWithTrainedAlgorithmicMedia', level: 'high', ai: true },
  { id: 'trained-algorithmic', needle: 'trainedalgorithmicmedia', value: 'trainedAlgorithmicMedia', level: 'high', ai: true },
  { id: 'algorithmic-enhance', needle: 'algorithmicallyenhanced', value: 'algorithmicallyEnhanced', level: 'warn', ai: false },
  { id: 'digital-capture', needle: 'digitalcapture', value: 'digitalCapture', level: 'good', ai: false },
];

/**
 * Platform labels that several tools stamp as plain text when they mark a file
 * as AI-made: Google's Gemini export, "Imagined with AI" from Meta, and the
 * generic "AI-generated content" tag. They are folded into the generator
 * catalogue rather than kept as a second list, so a file never reports the same
 * finding twice.
 */


/** Diffusion models emit a small set of characteristic output sizes. */
const DIFFUSION_SIZES = new Set([
  '512x512', '768x768', '1024x1024', '1024x1792', '1792x1024',
  '1344x768', '768x1344', '1536x1024', '1024x1536', '2048x2048', '1152x896',
]);

/* --------------------------------------------------------------- container */

interface ContainerScan {
  width: number | null;
  height: number | null;
  textChunks: string[];
  c2paPresent: boolean;
  c2paBytes: number;
  exifTags: TiffTag[];
}

function scanJpeg(b: Uint8Array): ContainerScan {
  const out: ContainerScan = { width: null, height: null, textChunks: [], c2paPresent: false, c2paBytes: 0, exifTags: [] };
  let i = 2;
  while (i + 4 < b.length) {
    if (b[i] !== 0xff) { i += 1; continue; }
    const marker = b[i + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    if (marker === 0xda) break;
    const length = u16be(b, i + 2);
    const start = i + 4;
    const end = i + 2 + length;
    if (end > b.length) break;

    if (marker === 0xe1) {
      const tag = ascii(b, start, 5);
      if (tag.startsWith('Exif')) out.exifTags.push(...parseTiff(b, start + 6));
      else out.textChunks.push(latin1(b, start, Math.min(end, start + 65536)));
    } else if (marker === 0xeb) {
      out.c2paPresent = true;
      out.c2paBytes += Math.max(0, end - start);
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      out.height = u16be(b, start + 1);
      out.width = u16be(b, start + 3);
    } else if (marker === 0xe0) {
      out.textChunks.push(latin1(b, start, Math.min(end, start + 64)));
    } else if (marker === 0xfe) {
      out.textChunks.push(latin1(b, start, Math.min(end, start + 512)));
    }
    i = end;
  }
  return out;
}

function scanPng(b: Uint8Array): ContainerScan {
  const out: ContainerScan = { width: null, height: null, textChunks: [], c2paPresent: false, c2paBytes: 0, exifTags: [] };
  let i = 8;
  while (i + 8 <= b.length) {
    const length = u32be(b, i);
    const type = ascii(b, i + 4, 4);
    const dataStart = i + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > b.length) break;

    if (type === 'IHDR') {
      out.width = u32be(b, dataStart);
      out.height = u32be(b, dataStart + 4);
    } else if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') {
      out.textChunks.push(latin1(b, dataStart, Math.min(dataEnd, dataStart + 65536)));
    } else if (type === 'eXIf') {
      out.exifTags.push(...parseTiff(b, dataStart));
    } else if (type === 'caBX') {
      out.c2paPresent = true;
      out.c2paBytes += length;
    }
    i = dataEnd + 4;
  }
  return out;
}

function scanWebp(b: Uint8Array): ContainerScan {
  const out: ContainerScan = { width: null, height: null, textChunks: [], c2paPresent: false, c2paBytes: 0, exifTags: [] };
  let i = 12;
  while (i + 8 <= b.length) {
    const id = ascii(b, i, 4);
    const size = u32le(b, i + 4);
    const start = i + 8;
    const end = Math.min(start + size, b.length);

    if (id === 'VP8X' && size >= 10) {
      out.width = 1 + (b[start + 4]! | (b[start + 5]! << 8) | (b[start + 6]! << 16));
      out.height = 1 + (b[start + 7]! | (b[start + 8]! << 8) | (b[start + 9]! << 16));
    } else if (id === 'EXIF') {
      out.exifTags.push(...parseTiff(b, start + (ascii(b, start, 6) === 'Exif\0\0' ? 6 : 0)));
    } else if (id === 'XMP ') {
      out.textChunks.push(latin1(b, start, end));
    } else if (id === 'C2PA') {
      out.c2paPresent = true;
      out.c2paBytes += size;
    }
    i = end + (size & 1);
  }
  return out;
}

function scanIsobmff(b: Uint8Array): ContainerScan {
  const out: ContainerScan = { width: null, height: null, textChunks: [], c2paPresent: false, c2paBytes: 0, exifTags: [] };
  // Locate ispe (image spatial extents) and the C2PA uuid box.
  for (let i = 0; i + 12 < b.length; i += 1) {
    const type = ascii(b, i, 4);
    if (type === 'ispe' && !out.width) {
      out.width = u32be(b, i + 8);
      out.height = u32be(b, i + 12);
    } else if (type === 'uuid' && !out.c2paPresent) {
      const uuid = b.subarray(i + 4, i + 20);
      // C2PA uuid D8FEC3D6-1B0E-483C-9297-5828877EC481
      if (uuid[0] === 0xd8 && uuid[1] === 0xfe && uuid[2] === 0xc3 && uuid[3] === 0xd6) {
        out.c2paPresent = true;
      }
    } else if (type === 'jumb') {
      out.c2paPresent = true;
    } else if (type === 'Exif') {
      out.exifTags.push(...parseTiff(b, i + 8));
    }
  }
  return out;
}

/* --------------------------------------------------------- pixel analysis */

function laplacianMap(gray: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      out[i] = 4 * gray[i]! - (gray[i - 1]! + gray[i + 1]! + gray[i - width]! + gray[i + width]!);
    }
  }
  return out;
}

/* --------------------------------------------------- DCT-II 8x8 and Benford */

/** Cosine basis precomputed once: COS[u * 8 + x] = cos((2x+1)uπ/16). */
const DCT_COS = (() => {
  const table = new Float32Array(64);
  for (let u = 0; u < 8; u += 1) {
    for (let x = 0; x < 8; x += 1) table[u * 8 + x] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
  }
  return table;
})();

const dctScale = (u: number): number => (u === 0 ? 1 / Math.SQRT2 : 1);

/**
 * Real 2D DCT-II on an 8x8 block (separable, so two 1D passes).
 * @param block 64 luminance samples, row-major
 * @param out 64 coefficients, row-major
 */
function dct8x8(block: Float32Array, out: Float32Array, tmp: Float32Array): void {
  for (let y = 0; y < 8; y += 1) {
    for (let u = 0; u < 8; u += 1) {
      let sum = 0;
      for (let x = 0; x < 8; x += 1) sum += block[y * 8 + x]! * DCT_COS[u * 8 + x]!;
      tmp[y * 8 + u] = 0.5 * dctScale(u) * sum;
    }
  }
  for (let u = 0; u < 8; u += 1) {
    for (let v = 0; v < 8; v += 1) {
      let sum = 0;
      for (let y = 0; y < 8; y += 1) sum += tmp[y * 8 + u]! * DCT_COS[v * 8 + y]!;
      out[v * 8 + u] = 0.5 * dctScale(v) * sum;
    }
  }
}

const BENFORD = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => Math.log10(1 + 1 / d));

/**
 * Benford's law over the leading digits of non-zero AC coefficients, the test
 * used in IEEE image-forensics work. Real sensor pipelines follow it closely;
 * diffusion decoders deviate, especially in the high frequencies.
 *
 * It is a contested signal and it is treated as one: reported, given a small
 * weight, and never decisive on its own.
 */
function benfordDct(gray: Float32Array, width: number, height: number, step = 8): BenfordReport | null {
  const counts = new Array<number>(9).fill(0);
  const block = new Float32Array(64);
  const coef = new Float32Array(64);
  const tmp = new Float32Array(64);
  let samples = 0;

  for (let by = 0; by + 8 <= height; by += step) {
    for (let bx = 0; bx + 8 <= width; bx += step) {
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          block[y * 8 + x] = gray[(by + y) * width + (bx + x)]!;
        }
      }
      dct8x8(block, coef, tmp);
      for (let k = 1; k < 64; k += 1) {
        const value = Math.abs(coef[k]!);
        if (value < 0.5) continue;
        const exponent = Math.floor(Math.log10(value));
        const leading = Math.floor(value / 10 ** exponent);
        if (leading >= 1 && leading <= 9) {
          counts[leading - 1] += 1;
          samples += 1;
        }
      }
    }
  }

  if (samples < 500) return null;
  const observed = counts.map((c) => c / samples);

  let kl = 0;
  for (let i = 0; i < 9; i += 1) {
    const p = observed[i]!;
    if (p > 0) kl += p * Math.log2(p / BENFORD[i]!);
  }
  const chiSquare = observed.reduce((sum, p, i) => sum + ((p - BENFORD[i]!) ** 2) / BENFORD[i]!, 0) * samples;

  return {
    observed: observed.map((v) => Math.round(v * 1000) / 1000),
    expected: BENFORD.map((v) => Math.round(v * 1000) / 1000),
    kl: Math.round(kl * 1000) / 1000,
    chiSquare: Math.round(chiSquare),
    conformity: Math.round(Math.max(0, Math.min(1, 1 - kl / 0.45)) * 1000) / 1000,
    samples,
  };
}

function analysePixels(source: HTMLImageElement | ImageBitmap, maxEdge = 1024): PixelReport {
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
  const width = Math.max(8, Math.round(source.width * scale));
  const height = Math.max(8, Math.round(source.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    return {
      laplacianMean: 0, laplacianStd: 0, blockUniformity: 0, chromaticAberration: 0,
      edgeDensity: 0, heatmap: canvas, benford: null, sampleWidth: width, sampleHeight: height,
    };
  }
  ctx.drawImage(source, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);

  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    gray[i] = 0.299 * data[i * 4]! + 0.587 * data[i * 4 + 1]! + 0.114 * data[i * 4 + 2]!;
  }

  const lap = laplacianMap(gray, width, height);

  // Mean and spread of the high-pass response.
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const v = lap[y * width + x]!;
      sum += v;
      sumSq += v * v;
      count += 1;
    }
  }
  const laplacianMean = count ? sum / count : 0;
  const laplacianVariance = count ? sumSq / count - laplacianMean * laplacianMean : 0;
  const laplacianStd = Math.sqrt(Math.max(0, laplacianVariance));

  // Block-wise variance: diffusion output tends to be unusually uniform.
  const blockVariances: number[] = [];
  for (let by = 0; by + 8 <= height - 1; by += 8) {
    for (let bx = 0; bx + 8 <= width - 1; bx += 8) {
      let s = 0;
      let s2 = 0;
      let n = 0;
      for (let y = by; y < by + 8; y += 1) {
        for (let x = bx; x < bx + 8; x += 1) {
          const v = lap[y * width + x]!;
          s += v;
          s2 += v * v;
          n += 1;
        }
      }
      const mean = s / n;
      blockVariances.push(Math.max(0, s2 / n - mean * mean));
    }
  }
  const blockMean = blockVariances.length
    ? blockVariances.reduce((a, b) => a + b, 0) / blockVariances.length
    : 0;
  const blockSd = blockVariances.length > 1
    ? Math.sqrt(blockVariances.reduce((a, b) => a + (b - blockMean) ** 2, 0) / (blockVariances.length - 1))
    : 0;
  const blockUniformity = blockMean > 0 ? 1 - Math.min(1, blockSd / blockMean) : 0;

  // Sobel edges, plus the red/blue divergence across them.
  let edgeSum = 0;
  let edgeCount = 0;
  let chromaSum = 0;
  let chromaCount = 0;
  const edges: Float32Array = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const gx = -gray[i - width - 1]! + gray[i - width + 1]!
        - 2 * gray[i - 1]! + 2 * gray[i + 1]!
        - gray[i + width - 1]! + gray[i + width + 1]!;
      const gy = -gray[i - width - 1]! - 2 * gray[i - width]! - gray[i - width + 1]!
        + gray[i + width - 1]! + 2 * gray[i + width]! + gray[i + width + 1]!;
      const magnitude = Math.hypot(gx, gy);
      edges[i] = magnitude;
      edgeSum += magnitude;
      edgeCount += 1;
      if (magnitude > 180) {
        const r = data[i * 4]!;
        const bl = data[i * 4 + 2]!;
        chromaSum += Math.abs(r - bl);
        chromaCount += 1;
      }
    }
  }
  const edgeDensity = edgeCount ? edgeSum / edgeCount / 1020 : 0;
  const chromaticAberration = chromaCount ? chromaSum / chromaCount / 255 : 0;

  // Heatmap of the high-pass response, for the overlay view.
  const heatmap = document.createElement('canvas');
  heatmap.width = width;
  heatmap.height = height;
  const hctx = heatmap.getContext('2d');
  if (hctx) {
    const image = hctx.createImageData(width, height);
    for (let i = 0; i < width * height; i += 1) {
      const magnitude = Math.min(255, Math.abs(lap[i]!) * 4);
      image.data[i * 4] = magnitude;
      image.data[i * 4 + 1] = Math.max(0, magnitude - 90);
      image.data[i * 4 + 2] = Math.max(0, 200 - magnitude * 2);
      image.data[i * 4 + 3] = 255;
    }
    hctx.putImageData(image, 0, 0);
  }

  const benford = benfordDct(gray, width, height);

  return {
    laplacianMean: Math.round(laplacianMean * 100) / 100,
    laplacianStd: Math.round(laplacianStd * 100) / 100,
    blockUniformity: Math.round(blockUniformity * 1000) / 1000,
    chromaticAberration: Math.round(chromaticAberration * 1000) / 1000,
    edgeDensity: Math.round(edgeDensity * 10000) / 10000,
    heatmap,
    benford,
    sampleWidth: width,
    sampleHeight: height,
  };
}

/* ------------------------------------------------------------------ main */

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const band = (v: number, lo: number, hi: number): number => clamp01((v - lo) / (hi - lo));

/**
 * Analyse an image file.
 * @param file the dropped or pasted file
 */
export async function analyseImageFile(file: File): Promise<ImageAnalysis> {
  const started = performance.now();
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const format = detectFormat(bytes);

  let scan: ContainerScan = { width: null, height: null, textChunks: [], c2paPresent: false, c2paBytes: 0, exifTags: [] };
  try {
    if (format === 'jpeg') scan = scanJpeg(bytes);
    else if (format === 'png') scan = scanPng(bytes);
    else if (format === 'webp') scan = scanWebp(bytes);
    else if (format === 'avif' || format === 'heif' || format === 'isobmff') scan = scanIsobmff(bytes);
  } catch {
    /* a malformed container should not take the tool down */
  }

  // Raw text is the haystack for signatures, comments and manifests.
  const head = latin1(bytes, 0, Math.min(bytes.length, 512 * 1024));
  const haystack = `${head}\n${scan.textChunks.join('\n')}`.toLowerCase();

  const signatures: SignatureHit[] = [];
  for (const generator of AI_GENERATORS) {
    const hit = generator.needles.find((needle) => haystack.includes(needle));
    if (hit) {
      const at = haystack.indexOf(hit);
      const context = haystack
        .slice(Math.max(0, at - 40), Math.min(haystack.length, at + 90))
        .replace(/[^\x20-\x7e]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 120);
      signatures.push({ id: generator.id, label: generator.label, detail: context });
    }
  }

  const editors = EDITOR_SOFTWARE.filter((e) => e.needles.some((n) => haystack.includes(n))).map((e) => e.label);

  // C2PA: presence plus the issuers named inside the manifest bytes.
  const c2paNeedles = ['c2pa', 'jumb', 'c2pa.claim', 'contentcredentials', 'content credentials'];
  const c2paTextHit = c2paNeedles.some((n) => haystack.includes(n));
  const c2paPresent = scan.c2paPresent || c2paTextHit;
  const c2paIssuers = c2paPresent
    ? C2PA_ISSUERS.filter((issuer) => issuer.needles.some((n) => haystack.includes(n))).map((i) => i.label)
    : [];
  const aiC2paDeclared = c2paIssuers.length > 0
    && (haystack.includes('trainedalgorithmicmedia')
      || haystack.includes('compositewithtrainedalgorithmicmedia')
      || haystack.includes('digitalsourcetype')
      || haystack.includes('c2pa.created'));
  const c2pa: C2paSummary = {
    present: c2paPresent,
    container: c2paPresent ? format : null,
    issuers: c2paIssuers,
    aiDeclared: aiC2paDeclared,
    manifestBytes: scan.c2paBytes,
  };

  // The IPTC source type and the platform labels are read from the same bytes,
  // independently of C2PA: a file can carry the declaration and no manifest.
  const declaredSource = DIGITAL_SOURCE_TYPES.find((type) => haystack.includes(type.needle)) ?? null;
  const declaredAi = declaredSource?.ai === true;

  // Camera fields.
  const find = (name: string): string | null =>
    scan.exifTags.find((t) => t.name === name)?.value ?? null;
  const camera: CameraInfo = {
    make: find('Make'),
    model: find('Model'),
    lens: find('LensModel'),
    iso: find('ISO'),
    fNumber: find('FNumber'),
    exposure: find('ExposureTime'),
    focalLength: find('FocalLength'),
    software: find('Software'),
    hasOptics: Boolean(find('Make') || find('Model') || find('FocalLength') || find('ExposureTime')),
  };

  const rawMetadata: Array<{ key: string; value: string; keyIsI18n: boolean }> = [
    ...scan.exifTags.map((t) => ({ key: t.name, value: t.value, keyIsI18n: false })),
  ];
  for (const editor of editors) rawMetadata.push({ key: 'img.meta.editingSoftware', value: editor, keyIsI18n: true });
  for (const signature of signatures) rawMetadata.push({ key: 'img.meta.generator', value: signature.label, keyIsI18n: true });

  const geometryKey = scan.width && scan.height ? `${scan.width}x${scan.height}` : '';
  const diffusionGeometry = Boolean(
    geometryKey && (DIFFUSION_SIZES.has(geometryKey) || scan.width === scan.height),
  );

  // Pixels, via the decoded image.
  let pixels: PixelReport | null = null;
  let decoded: HTMLImageElement | ImageBitmap | null = null;
  try {
    decoded = 'createImageBitmap' in window
      ? await createImageBitmap(file)
      : await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
      });
    pixels = analysePixels(decoded);
  } catch {
    pixels = null;
  }

  /* ---- scoring ---------------------------------------------------------- */
  const evidence: ImageEvidence[] = [];

  if (c2pa.aiDeclared) {
    evidence.push({
      id: 'c2pa-ai',
      level: 'high',
      labelKey: 'img.ev.c2paAi',
      detailText: c2paIssuers.join(', ') || null,
    });
  } else if (c2pa.present) {
    evidence.push({
      id: 'c2pa',
      level: 'info',
      labelKey: 'img.ev.c2paPresent',
      detailKey: c2paIssuers.length ? null : 'img.ev.c2paIssuerUnknown',
      detailText: c2paIssuers.length ? c2paIssuers.join(', ') : null,
    });
  }

  // The declared source type stands on its own, with or without a C2PA manifest.
  if (declaredSource) {
    evidence.push({
      id: `iptc-${declaredSource.id}`,
      level: declaredSource.level,
      labelKey: 'img.ev.iptc',
      labelParams: { value: declaredSource.value },
      detailKey: declaredSource.ai ? 'img.ev.iptcAi' : 'img.ev.iptcOther',
    });
  }

  for (const signature of signatures) {
    evidence.push({
      id: `sig-${signature.id}`,
      level: 'high',
      labelKey: 'img.ev.generator',
      labelParams: { name: signature.label },
      detailText: signature.detail.slice(0, 160),
    });
  }

  if (camera.hasOptics) {
    evidence.push({
      id: 'camera',
      level: 'good',
      labelKey: 'img.ev.camera',
      detailText: [camera.make, camera.model, camera.lens].filter(Boolean).join(' · ') || null,
    });
  }

  // "No metadata" must not be claimed while the file just showed some: an XMP
  // packet with a declared source type, or a generator signature, is metadata.
  if (!scan.exifTags.length && !c2pa.present && !declaredSource && signatures.length === 0) {
    evidence.push({
      id: 'no-metadata',
      level: 'warn',
      labelKey: 'img.ev.noMetadata',
      detailKey: 'img.ev.noMetadataDetail',
    });
  }

  if (diffusionGeometry && !camera.hasOptics) {
    evidence.push({
      id: 'geometry',
      level: 'warn',
      labelKey: 'img.ev.geometry',
      detailText: geometryKey,
    });
  }

  let score = 0;
  let verdict: ImageVerdict = 'unknown';

  if (declaredAi) {
    // A controlled-vocabulary declaration from the file itself. Not a heuristic.
    score = 96;
    verdict = 'ai';
  } else if (c2pa.aiDeclared) {
    score = 97;
    verdict = 'ai';
  } else if (signatures.length > 0) {
    score = 93;
    verdict = 'ai';
  } else if (camera.hasOptics && pixels) {
    // A real camera plus a low high-pass anomaly is the best "real" signal we
    // can honestly give. It is not proof either.
    const anomaly = clamp01(0.6 * pixels.blockUniformity + 0.4 * band(1 - pixels.chromaticAberration, 0.75, 0.95));
    score = Math.round(anomaly * 55);
    verdict = score < 25 ? 'real' : score < 45 ? 'likely-real' : 'unsure';
  } else if (pixels) {
    // Metadata stripped: pixel statistics only. These are a tendency, not a
    // test, so the ceiling is deliberately low and the verdict stays modest.
    // Calling a photo "AI" on pixels alone is exactly the failure mode this
    // project was criticised for, and it will not happen here.
    const uniformity = band(pixels.blockUniformity, 0.4, 0.95);
    const lowEdges = bandInverse(pixels.edgeDensity, 0.01, 0.09);
    const chroma = bandInverse(pixels.chromaticAberration, 0.06, 0.35);
    const smoothness = bandInverse(pixels.laplacianStd, 4, 40);
    const geometryBoost = diffusionGeometry ? 0.12 : 0;
    const benfordFlag = pixels.benford ? 1 - pixels.benford.conformity : 0;
    const raw = 0.3 * uniformity + 0.18 * lowEdges + 0.2 * chroma + 0.22 * smoothness + 0.1 * benfordFlag + geometryBoost;
    score = Math.min(70, Math.round(clamp01(raw) * 100));
    // Without provenance we never accuse: pixels can raise a doubt, never a
    // verdict of AI.
    verdict = score >= 45 ? 'unsure' : 'likely-real';

    if (pixels.benford && pixels.benford.conformity < 0.5) {
      evidence.push({
        id: 'benford',
        level: 'warn',
        labelKey: 'img.ev.benford',
        detailKey: 'img.ev.benfordDetail',
        detailParams: { kl: pixels.benford.kl, samples: pixels.benford.samples },
      });
    }
    evidence.push({
      id: 'pixels-only',
      level: 'warn',
      labelKey: 'img.ev.pixelsOnly',
      detailKey: 'img.ev.pixelsOnlyDetail',
    });
  }

  for (const signature of signatures) void signature;
  void aiC2paDeclared;

  return {
    name: file.name,
    bytes: file.size,
    mime: file.type,
    format,
    width: scan.width,
    height: scan.height,
    c2pa,
    signatures,
    camera,
    rawMetadata: rawMetadata.slice(0, 40),
    diffusionGeometry,
    pixels,
    score: Math.max(0, Math.min(100, score)),
    verdict,
    evidence,
    ms: Math.round(performance.now() - started),
  };
}

function bandInverse(v: number, lo: number, hi: number): number {
  return 1 - band(v, lo, hi);
}
