/// <reference lib="webworker" />
/**
 * The learned image probe, in a dedicated worker.
 *
 * The encoder is CLIP ViT-L/14 with the 1024-d pooled CLS feature exposed as
 * `pooler_output`, hosted on the Hugging Face Hub (see CREDITS.md). Every other
 * browser-ready export of this encoder stops at the 768-d projected
 * `image_embeds`, which is not the feature the probe was trained on; feeding 768
 * numbers to a 1024-weight probe would return a plausible, silently wrong
 * reading. The published encoder was rebuilt by graph surgery for this reason.
 *
 * The worker runs the encoder off the main thread and on one WASM thread only, so
 * a large image never saturates the machine. It turns a normalised 224x224 tensor
 * into the 1024-d embedding; the probe arithmetic lives on the main thread, where
 * it is tested against the published coefficients.
 */

import * as ort from 'onnxruntime-web';
import type { ImageWorkerRequest, ImageWorkerResponse } from './types';

// One thread: honour the promise that this tool never pegs the CPU.
ort.env.wasm.numThreads = 1;
ort.env.logLevel = 'error';

const post = (message: ImageWorkerResponse): void => {
  (self as unknown as Worker).postMessage(message);
};

let session: ort.InferenceSession | null = null;
let loading: Promise<void> | null = null;
let currentId = '';

/** Loads once, and lets a probe that arrives early wait instead of racing. */
function ensureLoaded(id: string): Promise<void> {
  if (session) return Promise.resolve();
  if (!loading) loading = load(id);
  return loading;
}

/** Streamed download, so the panel can show real progress on a 293 MB file. */
async function fetchWithProgress(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`download failed: ${response.status}`);
  const total = Number(response.headers.get('content-length') ?? 0);
  const reader = response.body?.getReader();
  if (!reader) return response.arrayBuffer();

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.length;
      post({
        type: 'progress',
        phase: 'download',
        progress: total ? Math.round((loaded / total) * 100) : 0,
        loaded,
        total,
      });
    }
  }

  const out = new Uint8Array(loaded);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out.buffer;
}

async function load(id: string): Promise<void> {
  if (session) {
    post({ type: 'ready', modelId: id });
    return;
  }
  const buffer = await fetchWithProgress(id);
  post({ type: 'progress', phase: 'init', progress: 100 });
  session = await ort.InferenceSession.create(new Uint8Array(buffer), {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
  post({ type: 'ready', modelId: id });
}

async function embed(pixels: Float32Array): Promise<number[]> {
  if (!session) throw new Error('session unavailable');
  const tensor = new ort.Tensor('float32', pixels, [1, 3, 224, 224]);
  const output = await session.run({ pixel_values: tensor });
  const pooled = output.pooler_output;
  if (!pooled) throw new Error('pooler_output missing from the graph');
  return Array.from(pooled.data as Float32Array);
}

self.addEventListener('message', (event: MessageEvent<ImageWorkerRequest>) => {
  const data = event.data;

  if (data.type === 'load') {
    currentId = data.modelId;
    void (async () => {
      try {
        await ensureLoaded(data.modelId);
      } catch (error) {
        post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();
    return;
  }

  if (data.type === 'probe') {
    void (async () => {
      const started = performance.now();
      try {
        // The probe may arrive while the 293 MB is still downloading.
        if (!session && currentId) await ensureLoaded(currentId);
        const embedding = await embed(data.pixels);
        post({ type: 'probed', id: data.id, embedding, ms: Math.round(performance.now() - started) });
      } catch (error) {
        post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();
  }
});
