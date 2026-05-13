import { DemoPoseGenerator } from '../demo/demo-pose-generator';
import { NormalizedPacket } from '../ingestion/event-bus';
import { InferenceResult, OnnxInferenceService } from '../inference/onnx-inference.service';
import { InferredMotionFrame } from './pose.types';
import { PoseInferenceAdapter } from './pose-inference.adapter';

describe('PoseInferenceAdapter', () => {
  const createWindow = (): NormalizedPacket[] =>
    Array.from({ length: 64 }, (_, index) => ({
      receivedAt: 1_710_000_000_000 + index,
      timestamp: 1_710_000_000_000 + index,
      rssi: -52,
      channel: 6,
      mac: 'AA:BB:CC:DD:EE:FF',
      amplitude: Array.from({ length: 64 }, () => 0),
      phase: Array.from({ length: 64 }, () => 0),
      packetIndex: index,
    }));

  const createInferenceResult = (): InferenceResult => ({
    keypoints: Array.from({ length: 17 }, (_, index) => ({
      name: 'keypoint-' + index,
      x: index / 100,
      y: index / 100,
      confidence: 0.12,
    })),
    proxyMetrics: {
      estimatedCadence: 158,
      symmetryProxy: 0.49,
      contactTimeProxy: 0.21,
    },
    modelConfidence: 0.12,
    inferenceTimeMs: 4.2,
    modelVersion: 'bootstrap-zero-v0.0.1',
  });

  const createDemoFrame = (): InferredMotionFrame => ({
    timestamp: 1_710_000_000_063,
    frameIndex: 99,
    keypoints2D: null,
    joints3D: null,
    confidence: 0.3,
    confidenceLevel: 'low',
    modelVersion: 'demo-v0.1.0',
    experimental: true,
    signalQualityScore: 0.35,
    validationStatus: 'experimental',
  });

  it('prefers ONNX inference when the runtime is ready', async () => {
    const demoPoseGenerator = {
      generate: jest.fn(),
    } as unknown as DemoPoseGenerator;
    const onnxInferenceService = {
      isReady: jest.fn().mockReturnValue(true),
      predict: jest.fn().mockResolvedValue(createInferenceResult()),
    } as unknown as OnnxInferenceService;
    const adapter = new PoseInferenceAdapter(demoPoseGenerator, onnxInferenceService);

    const frame = await adapter.infer(createWindow());

    expect(onnxInferenceService.isReady).toHaveBeenCalledTimes(1);
    expect(onnxInferenceService.predict).toHaveBeenCalledTimes(1);
    expect(demoPoseGenerator.generate).not.toHaveBeenCalled();
    expect(frame).toMatchObject({
      modelVersion: 'bootstrap-zero-v0.0.1',
      experimental: true,
      validationStatus: 'unvalidated',
      confidenceLevel: 'low',
    });
    expect(frame?.keypoints2D).toHaveLength(17);
  });

  it('falls back to the demo generator when ONNX returns null', async () => {
    const demoFrame = createDemoFrame();
    const demoPoseGenerator = {
      generate: jest.fn().mockReturnValue(demoFrame),
    } as unknown as DemoPoseGenerator;
    const onnxInferenceService = {
      isReady: jest.fn().mockReturnValue(true),
      predict: jest.fn().mockResolvedValue(null),
    } as unknown as OnnxInferenceService;
    const adapter = new PoseInferenceAdapter(demoPoseGenerator, onnxInferenceService);

    const frame = await adapter.infer(createWindow());

    expect(onnxInferenceService.predict).toHaveBeenCalledTimes(1);
    expect(demoPoseGenerator.generate).toHaveBeenCalledTimes(1);
    expect(frame).toBe(demoFrame);
  });
});
