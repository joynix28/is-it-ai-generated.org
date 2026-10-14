/// <reference lib="webworker" />
/**
 * The learned image probe, in a dedicated worker.
 *
 * NOT WIRED YET, on purpose. This worker expects an encoder that returns the
 * 1024-d pooled CLS output of CLIP ViT-L/14 (timm's
 * `vit_large_patch14_clip_224.openai`, num_classes=0) — the features the probe
 * was trained on. Every browser-ready ONNX export exposes only the 768-d
 * *projected* `image_embeds`, and feeding 768 numbers to a 1024-weight probe
 * would produce a plausible, silently wrong reading. The panel stays out of the
 * interface until the vision tower is exported without its projection head,
 * quantised and hosted; see CREDITS.md.
 *
 * When that encoder exists, the worker turns a JPEG-normalised image into the
 * embedding and the probe arithmetic (tested in src/imageProbe.ts) runs on the
 * main thread.
 */

import { AutoProcessor, CLIPVisionModel, RawImage, env } from '@huggingface/transformers';
import type { ImageWorkerRequest, ImageWorkerResponse } from './types';

env.allowLocalModels = false;
env.useBrowserCache = true;

const post = (message: ImageWorkerResponse): void => {
  (self as unknown as Worker).postMessage(message);
};

/** A processor is callable; the union Transformers.js returns is unwieldy. */
type ImageProcessor = (input: RawImage) => Promise<Record<string, unknown>>;
type VisionModel = (inputs: Record<string, unknown>) => Promise<{ pooler_output: { data: Float32Array } }>;

let processor: ImageProcessor | null = null;
let model: VisionModel | null = null;
let loadedId = '';

async function load(id: string): Promise<void> {
  if (model && processor && loadedId === id) {
    post({ type: 'ready', modelId: id });
    return;
  }

  const progress_callback = (report: { status?: string; file?: string; progress?: number; loaded?: number; total?: number }): void => {
    post({
      type: 'progress',
      phase: report.status === 'progress' ? 'download' : 'init',
      file: report.file,
      progress: Math.round(report.progress ?? 0),
      loaded: report.loaded,
      total: report.total,
    });
  };

  processor = (await AutoProcessor.from_pretrained(id, { progress_callback })) as unknown as ImageProcessor;
  // Only the vision tower is fetched: 293 MB quantised, not the combined model.
  model = (await CLIPVisionModel.from_pretrained(id, {
    dtype: 'q8',
    progress_callback,
  })) as unknown as VisionModel;

  loadedId = id;
  post({ type: 'ready', modelId: id });
}

/** The pooled CLS output is the 1024-d feature the probe was trained on. */
async function embed(blob: Blob): Promise<number[]> {
  if (!processor || !model) throw new Error('model unavailable');
  const image = await RawImage.fromBlob(blob);
  const inputs = await processor(image);
  const output = await model(inputs);
  return Array.from(output.pooler_output.data);
}

self.addEventListener('message', (event: MessageEvent<ImageWorkerRequest>) => {
  const data = event.data;

  if (data.type === 'load') {
    void (async () => {
      try {
        await load(data.modelId);
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
        await load(data.modelId);
        const embedding = await embed(data.blob);
        post({ type: 'probed', id: data.id, embedding, ms: Math.round(performance.now() - started) });
      } catch (error) {
        post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();
  }
});
