/**
 * Neural image classifier, running fully in the browser.
 *
 * Model: Community Forensics ViT-S/16 @384 (OwensLab/commfor-model-384, MIT),
 * distributed as ONNX by buildborderless/CommunityForensics-DeepfakeDet-ViT.
 * Trained across ~4,800 generators, so it generalises to unseen models far
 * better than a handful of pixel heuristics.
 *
 * Runtime: onnxruntime-web WASM SIMD, self-hosted. The model file and the
 * runtime are served from this origin, so no request carries the image.
 *
 * Everything is lazy: nothing is downloaded until the user asks for a model
 * run, and the model stays in memory afterwards.
 */

const MODEL_URL = '/models/community-forensics-int8.onnx';
const ORT_DIR = '/vendor/ort/';
const SIZE = 384;
const SHORT_EDGE = 440;
// CLIP normalisation, from the model's preprocessor_config.json.
const MEAN = [0.48145466, 0.4578275, 0.40821073];
const STD = [0.26862954, 0.26130258, 0.27577711];

/**
 * Decision thresholds on P(AI). The raw sigmoid of the single logit is
 * already a usable probability (a black frame scores 0.002), so we do not
 * apply the third-party Platt constants, which shift the scale.
 */
export const MODEL_THRESHOLDS = { real: 0.35, ai: 0.65, strongAI: 0.85 };

let ort = null;
let session = null;
let loading = null;

export const MODEL_INFO = {
  id: 'buildborderless/CommunityForensics-DeepfakeDet-ViT',
  upstream: 'OwensLab/commfor-model-384',
  arch: 'ViT-S/16 @384, int8 ONNX',
  license: 'MIT',
  bytes: 23028026,
  input: 'pixel_values [1,3,384,384]',
  notes: 'Cross-generator detector (Community Forensics, CVPR 2025).',
};

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

/** Load the runtime and the model once. */
export async function loadClassifier(onProgress) {
  if (session) return session;
  if (loading) return loading;
  loading = (async () => {
    if (typeof fetch !== 'function') throw new Error('fetch unavailable');
    onProgress?.({ phase: 'runtime', loaded: 0, total: 0 });
    ort = await import(/* @vite-ignore */ `${ORT_DIR}ort.wasm.mjs`);
    ort.env.wasm.wasmPaths = ORT_DIR;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;

    onProgress?.({ phase: 'model', loaded: 0, total: MODEL_INFO.bytes });
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`model fetch failed: ${res.status}`);
    const total = Number(res.headers.get('content-length')) || MODEL_INFO.bytes;
    const reader = res.body?.getReader();
    let bytes;
    if (reader) {
      const chunks = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        onProgress?.({ phase: 'model', loaded, total });
      }
      bytes = new Uint8Array(loaded);
      let o = 0;
      for (const c of chunks) { bytes.set(c, o); o += c.length; }
    } else {
      bytes = new Uint8Array(await res.arrayBuffer());
      onProgress?.({ phase: 'model', loaded: total, total });
    }

    onProgress?.({ phase: 'init', loaded: 0, total: 0 });
    session = await ort.InferenceSession.create(bytes, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
    return session;
  })();
  return loading;
}

export const classifierReady = () => Boolean(session);

/* ------------------------------------------------------------ preprocessing */

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Resize so the short edge is 440, then center-crop 384. Official transform. */
function officialView(bitmap) {
  const short = Math.min(bitmap.width, bitmap.height);
  const scale = SHORT_EDGE / short;
  const w = Math.max(SIZE, Math.round(bitmap.width * scale));
  const h = Math.max(SIZE, Math.round(bitmap.height * scale));
  const resized = makeCanvas(w, h);
  const rctx = resized.getContext('2d', { willReadFrequently: true });
  rctx.imageSmoothingEnabled = true;
  rctx.imageSmoothingQuality = 'high';
  rctx.drawImage(bitmap, 0, 0, w, h);

  const out = makeCanvas(SIZE, SIZE);
  const octx = out.getContext('2d', { willReadFrequently: true });
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(resized, (w - SIZE) / 2, (h - SIZE) / 2, SIZE, SIZE, 0, 0, SIZE, SIZE);
  return octx.getImageData(0, 0, SIZE, SIZE);
}

/** Squash the whole frame into 384x384, aspect dropped. Complementary view. */
function squashView(bitmap) {
  const out = makeCanvas(SIZE, SIZE);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, SIZE, SIZE);
  return ctx.getImageData(0, 0, SIZE, SIZE);
}

/** RGBA -> normalized NCHW float32. */
function toNchw(imageData) {
  const { data, width, height } = imageData;
  const out = new Float32Array(3 * width * height);
  const px = width * height;
  for (let i = 0; i < px; i += 1) {
    const r = data[i * 4] / 255;
    const g = data[i * 4 + 1] / 255;
    const b = data[i * 4 + 2] / 255;
    out[i] = (r - MEAN[0]) / STD[0];
    out[px + i] = (g - MEAN[1]) / STD[1];
    out[2 * px + i] = (b - MEAN[2]) / STD[2];
  }
  return out;
}

async function runView(bitmap, view) {
  const imageData = view === 'squash' ? squashView(bitmap) : officialView(bitmap);
  const tensor = new ort.Tensor('float32', toNchw(imageData), [1, 3, SIZE, SIZE]);
  const out = await session.run({ [session.inputNames[0]]: tensor });
  return out[session.outputNames[0]].data[0];
}

/**
 * Classify an image element or bitmap.
 * @param {ImageBitmap|HTMLImageElement} source
 * @param {{views?: 'official'|'both'}} [opts]
 * @returns {Promise<{pAI:number, logit:number, views:{official:number, squash?:number}, verdict:string}>}
 */
export async function classifyImage(source, opts = {}) {
  await loadClassifier();
  const views = opts.views === 'both' ? ['official', 'squash'] : ['official'];

  let bitmap = source;
  let owned = false;
  if (typeof createImageBitmap === 'function' && !(source instanceof ImageBitmap)) {
    bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' });
    owned = true;
  }

  const logits = {};
  for (const v of views) logits[v] = await runView(bitmap, v);
  if (owned) bitmap.close?.();

  const values = Object.values(logits);
  const meanLogit = values.reduce((a, b) => a + b, 0) / values.length;
  const pAI = sigmoid(meanLogit);
  const pRaw = sigmoid(logits.official);

  let verdict = 'unsure';
  if (pAI < MODEL_THRESHOLDS.real) verdict = 'real';
  else if (pAI >= MODEL_THRESHOLDS.strongAI) verdict = 'ai';
  else if (pAI >= MODEL_THRESHOLDS.ai) verdict = 'likely-ai';

  return {
    pAI,
    pOfficial: pRaw,
    logit: meanLogit,
    logits,
    views,
    verdict,
    thresholds: MODEL_THRESHOLDS,
    model: MODEL_INFO,
  };
}
