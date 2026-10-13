/// <reference lib="webworker" />
/**
 * Layer 2: the neural classifier, in a dedicated worker.
 *
 * Transformers.js loads a quantised ONNX classifier and runs it off the main
 * thread, so typing never drops a frame. If it fails (offline, blocked CDN,
 * unsupported device) the worker reports the error and the app keeps working on
 * Layer 1 alone.
 *
 * The model ships no label map, and providers do not agree on label order, so
 * rather than hard-coding "LABEL_1 means AI" the worker calibrates itself: it
 * classifies one fixed machine-written string and one fixed human string, and
 * keeps whichever label scores higher on the machine string. Two inferences at
 * load, and the mapping can never be silently inverted.
 *
 * Chunks are streamed as they finish, so the panel fills in progressively.
 */

import { pipeline, env, type TextClassificationPipeline } from '@huggingface/transformers';
import type { WorkerRequest, WorkerResponse } from './types';

env.allowLocalModels = false;
env.useBrowserCache = true;

/** Reference strings used only to discover the model's label order. */
const CALIBRATION_AI =
  "In today's fast-paced world, it is important to note that leveraging cutting-edge solutions plays a crucial role in modern organizations. Furthermore, a comprehensive approach facilitates robust outcomes across a wide range of use cases.";
const CALIBRATION_HUMAN =
  'The kettle broke this morning. I found the receipt, drove to the shop, and they swapped it, no questions. Took twenty minutes. Then I forgot the milk on the counter and had to go back.';

const post = (message: WorkerResponse): void => {
  (self as unknown as Worker).postMessage(message);
};

let classifier: TextClassificationPipeline | null = null;
let loadedId = '';
/** The label the model uses for machine-written text, found by calibration. */
let machineLabel = 'LABEL_1';

async function classifyOnce(text: string): Promise<Array<{ label: string; score: number }>> {
  if (!classifier) throw new Error('classifier unavailable');
  const output = await classifier(text, { top_k: 2 });
  return (Array.isArray(output) ? output : [output]) as Array<{ label: string; score: number }>;
}

async function calibrate(): Promise<void> {
  const [machine, human] = await Promise.all([
    classifyOnce(CALIBRATION_AI),
    classifyOnce(CALIBRATION_HUMAN),
  ]);
  const humanScores = new Map(human.map((row) => [row.label, row.score]));
  // The machine label is the one that is high on machine text and low on human
  // text, which is robust even when the model reverses its own label order.
  let bestLabel = machineLabel;
  let bestMargin = -Infinity;
  for (const row of machine) {
    const margin = row.score - (humanScores.get(row.label) ?? 0);
    if (margin > bestMargin) {
      bestMargin = margin;
      bestLabel = row.label;
    }
  }
  machineLabel = bestLabel;
}

async function load(id: string): Promise<void> {
  if (classifier && loadedId === id) {
    post({ type: 'ready', modelId: id });
    return;
  }

  const progress_callback = (report: {
    status?: string;
    file?: string;
    progress?: number;
    loaded?: number;
    total?: number;
  }): void => {
    post({
      type: 'progress',
      phase: report.status === 'progress' ? 'download' : 'init',
      file: report.file,
      progress: Math.round(report.progress ?? 0),
      loaded: report.loaded,
      total: report.total,
    });
  };

  // The pipeline overloads produce an unwieldy union through TypeScript; the
  // runtime shape is fixed, so assert it once here.
  classifier = (await (pipeline('text-classification', id, {
    dtype: 'q8',
    progress_callback,
  }) as unknown as Promise<TextClassificationPipeline>));

  await calibrate();
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

  if (data.type === 'classify') {
    void (async () => {
      const started = performance.now();
      try {
        await load(data.modelId);

        let weighted = 0;
        let weightSum = 0;
        let peak = 0;

        for (let index = 0; index < data.chunks.length; index += 1) {
          const text = data.chunks[index]!;
          const rows = await classifyOnce(text);
          const row = rows.find((r) => r.label === machineLabel) ?? rows[0];
          const score = row ? row.score : 0.5;
          const weight = Math.max(1, text.length);

          weighted += score * weight;
          weightSum += weight;
          peak = Math.max(peak, score);

          post({ type: 'chunk', id: data.id, result: { index, label: row?.label ?? 'unknown', score, text } });
        }

        post({
          type: 'done',
          id: data.id,
          result: {
            label: machineLabel,
            score: weightSum ? weighted / weightSum : 0.5,
            chunks: [],
            ms: Math.round(performance.now() - started),
          },
        });
        void peak;
      } catch (error) {
        post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    })();
  }
});
