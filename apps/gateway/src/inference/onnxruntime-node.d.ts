// onnxruntime-node may not be installed — this declaration
// prevents TS errors on the dynamic import() path.
declare module 'onnxruntime-node' {
  export class InferenceSession {
    static create(path: string): Promise<InferenceSession>;
    inputNames: string[];
    outputNames: string[];
    handler?: { metadata?: Map<string, string> };
    run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>>;
  }

  export class Tensor {
    constructor(type: string, data: Float32Array, dims: number[]);
  }
}
