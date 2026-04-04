import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InferredMotionFrame } from '../pose/pose.types';

/** Shape metadata reported by the ONNX model. */
export interface ModelInfo {
  inputShape: number[];
  outputShape: number[];
  modelVersion: string;
  modelPath: string;
}

/** Result of an ONNX model inference call. */
export interface InferenceResult {
  /** 17 COCO keypoints × 3 (x, y, conf) = 51 values. */
  keypoints: Array<{ name: string; x: number; y: number; confidence: number }>;
  /** Proxy metrics: [cadence, symmetry, contactTime]. */
  proxyMetrics: { estimatedCadence: number; symmetryProxy: number; contactTimeProxy: number };
  /** Overall model confidence (0–1). */
  modelConfidence: number;
  /** Wall-clock time for the inference call (ms). */
  inferenceTimeMs: number;
  /** Version string embedded in / derived from the model. */
  modelVersion: string;
}

const COCO_KEYPOINT_NAMES = [
  'nose',
  'left_eye',
  'right_eye',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
];

@Injectable()
export class OnnxInferenceService implements OnModuleInit {
  private readonly logger = new Logger(OnnxInferenceService.name);

  private session: any = null;
  private ort: any = null;
  private ready = false;
  private modelPath: string;
  private modelVersion = 'unknown';
  private inputShape: number[] = [];
  private outputShape: number[] = [];

  constructor() {
    this.modelPath = process.env.ONNX_MODEL_PATH ?? 'storage/models/csi_pose_net.onnx';
  }

  async onModuleInit() {
    await this.initialize();
  }

  async initialize(): Promise<void> {
    try {
      // Dynamic import — onnxruntime-node may not be installed
      this.ort = await import('onnxruntime-node');
    } catch {
      this.logger.warn(
        'onnxruntime-node not available — ONNX inference disabled. ' +
          'Install it with: npm install onnxruntime-node',
      );
      return;
    }

    try {
      const fs = await import('fs');
      if (!fs.existsSync(this.modelPath)) {
        this.logger.warn(
          `ONNX model not found at ${this.modelPath} — inference disabled. ` +
            'Gateway will continue without pose inference.',
        );
        return;
      }

      this.session = await this.ort.InferenceSession.create(this.modelPath);

      // Extract shape info from model metadata
      const inputMeta = this.session.inputNames;
      const outputMeta = this.session.outputNames;

      if (inputMeta.length > 0) {
        this.inputShape = this.session.inputNames.length
          ? [1] // batch dimension; full shape from model
          : [];
      }
      if (outputMeta.length > 0) {
        this.outputShape = [1]; // batch
      }

      this.modelVersion =
        this.session.handler?.metadata?.get?.('version') ?? 'onnx-v0.1.0';

      this.ready = true;
      this.logger.log(
        `ONNX model loaded from ${this.modelPath} — ` +
          `inputs: [${inputMeta.join(', ')}], outputs: [${outputMeta.join(', ')}]`,
      );
    } catch (err) {
      this.logger.error(`Failed to load ONNX model from ${this.modelPath}: ${err}`);
      this.ready = false;
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  getModelInfo(): ModelInfo | null {
    if (!this.ready) return null;
    return {
      inputShape: this.inputShape,
      outputShape: this.outputShape,
      modelVersion: this.modelVersion,
      modelPath: this.modelPath,
    };
  }

  async predict(features: number[]): Promise<InferenceResult | null> {
    if (!this.ready || !this.session || !this.ort) {
      return null;
    }

    const start = performance.now();

    try {
      const inputTensor = new this.ort.Tensor(
        'float32',
        Float32Array.from(features),
        [1, features.length],
      );

      const inputName = this.session.inputNames[0];
      const feeds: Record<string, any> = { [inputName]: inputTensor };

      const results = await this.session.run(feeds);

      const inferenceTimeMs = Math.round((performance.now() - start) * 100) / 100;

      // Parse outputs — expect two heads: keypoints (51) + proxy metrics (3)
      const outputNames = this.session.outputNames as string[];
      let keypointValues: Float32Array | number[] = new Float32Array(51);
      let proxyValues: Float32Array | number[] = new Float32Array(3);

      if (outputNames.length >= 2) {
        keypointValues = results[outputNames[0]].data as Float32Array;
        proxyValues = results[outputNames[1]].data as Float32Array;
      } else if (outputNames.length === 1) {
        // Single output: first 51 = keypoints, next 3 = proxy metrics
        const all = results[outputNames[0]].data as Float32Array;
        keypointValues = all.slice(0, 51);
        proxyValues = all.slice(51, 54);
      }

      // Parse keypoints: 17 × 3 (x, y, confidence)
      const keypoints = COCO_KEYPOINT_NAMES.map((name, i) => ({
        name,
        x: keypointValues[i * 3] ?? 0,
        y: keypointValues[i * 3 + 1] ?? 0,
        confidence: Math.max(0, Math.min(1, keypointValues[i * 3 + 2] ?? 0)),
      }));

      const modelConfidence =
        keypoints.reduce((sum, kp) => sum + kp.confidence, 0) / keypoints.length;

      return {
        keypoints,
        proxyMetrics: {
          estimatedCadence: proxyValues[0] ?? 0,
          symmetryProxy: Math.max(0, Math.min(1, proxyValues[1] ?? 0.5)),
          contactTimeProxy: Math.max(0, proxyValues[2] ?? 0),
        },
        modelConfidence: Math.round(modelConfidence * 1000) / 1000,
        inferenceTimeMs,
        modelVersion: this.modelVersion,
      };
    } catch (err) {
      this.logger.error(`ONNX inference failed: ${err}`);
      return null;
    }
  }
}
