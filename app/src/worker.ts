/// <reference lib="webworker" />
/**
 * Layer 2: the language-model juror, in a dedicated worker.
 *
 * Transformers.js loads a small quantised causal model and reads text off the
 * main thread, so typing never drops a frame. It never sees the network beyond
 * the one-time model download. If it fails (offline, blocked CDN, unsupported
 * device) the worker reports the error and the jury keeps working without it.
 *
 * The worker does one thing: it measures perplexity, the average surprise the
 * model feels at each token. It does not decide anything. Three numbers come
 * back — the text, the hand-written anchor, the machine anchor — and the vote
 * they imply is computed on the main thread, where it can be tested.
 */

import { AutoModelForCausalLM, AutoTokenizer, env, type PreTrainedModel, type PreTrainedTokenizer } from '@huggingface/transformers';
import type { PerplexityReport, WorkerRequest, WorkerResponse } from './types';

env.allowLocalModels = false;
env.useBrowserCache = true;

const post = (message: WorkerResponse): void => {
  (self as unknown as Worker).postMessage(message);
};

let tokenizer: PreTrainedTokenizer | null = null;
let model: PreTrainedModel | null = null;
let loadedId = '';

/** Longest window fed to the model. The context is 32k, attention is not cheap. */
const MAX_TOKENS = 300;

/**
 * Mean per-token surprise, exponentiated. One forward pass: the logits at
 * position t are the distribution the model would have used to write token t+1,
 * and the model's own log-probability of the token that is actually there is the
 * surprise.
 */
async function perplexity(text: string): Promise<number> {
  if (!tokenizer || !model) throw new Error('model unavailable');

  const enc = await tokenizer(text, { truncation: true, max_length: MAX_TOKENS });
  const output = await model(enc);
  const logits = (output as { logits: { data: Float32Array; dims: number[] } }).logits;
  const data = logits.data;
  const [, seq, vocab] = logits.dims as [number, number, number];
  const ids = Array.from(enc.input_ids.data as unknown as ArrayLike<bigint>).map(Number);

  let total = 0;
  let counted = 0;
  for (let t = 1; t < seq; t += 1) {
    const target = ids[t]!;
    const offset = (t - 1) * vocab;

    let max = -Infinity;
    for (let v = 0; v < vocab; v += 1) {
      const z = data[offset + v]!;
      if (z > max) max = z;
    }
    let sum = 0;
    for (let v = 0; v < vocab; v += 1) sum += Math.exp(data[offset + v]! - max);

    total += -(data[offset + target]! - max - Math.log(sum));
    counted += 1;
  }

  if (!counted) return Number.POSITIVE_INFINITY;
  return Math.exp(total / counted);
}

async function load(id: string): Promise<void> {
  if (model && tokenizer && loadedId === id) {
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

  tokenizer = (await AutoTokenizer.from_pretrained(id, { progress_callback })) as unknown as PreTrainedTokenizer;
  model = (await AutoModelForCausalLM.from_pretrained(id, {
    dtype: 'q8',
    progress_callback,
  })) as unknown as PreTrainedModel;

  loadedId = id;
  post({ type: 'ready', modelId: id });
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
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

  if (data.type === 'score') {
    void (async () => {
      const started = performance.now();
      try {
        await load(data.modelId);
        // Calibration anchors first: if they cannot be separated, the vote is
        // thrown away on the main thread anyway, but the numbers are always
        // reported so the reader can see why.
        const [text, human, machine] = [
          await perplexity(data.text.slice(0, 1600)),
          await perplexity(data.humanAnchor),
          await perplexity(data.machineAnchor),
        ];
        const report: PerplexityReport = { text, human, machine, ms: Math.round(performance.now() - started) };
        post({ type: 'scored', id: data.id, report });
      } catch (error) {
        post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();
  }
});
