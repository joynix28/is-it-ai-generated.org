/**
 * Minimal, explicit declarations for the slice of onnxruntime-web we use.
 *
 * The package ships `types.d.ts`, but its `exports` map does not expose it to
 * TypeScript, and the project forbids `any`. So the handful of members we touch
 * are declared here, exactly, instead of reaching for a wildcard module.
 */
declare module 'onnxruntime-web' {
  export type TensorData = Float32Array | Int32Array | Uint8Array | BigInt64Array;

  export class Tensor {
    constructor(type: 'float32', data: Float32Array, dims: readonly number[]);
    readonly data: TensorData;
    readonly dims: readonly number[];
  }

  export interface SessionOptions {
    executionProviders?: string[];
    graphOptimizationLevel?: 'disabled' | 'basic' | 'extended' | 'all';
  }

  export class InferenceSession {
    static create(model: string | Uint8Array, options?: SessionOptions): Promise<InferenceSession>;
    run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>;
  }

  export const env: {
    wasm: { numThreads: number };
    logLevel: 'verbose' | 'info' | 'warning' | 'error' | 'fatal';
  };
}
