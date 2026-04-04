import { Injectable, Logger } from '@nestjs/common';
import { InferredMotionFrame } from './pose.types';

/**
 * Adapter for pose inference. In production, this calls a local Python service
 * or loads an ONNX model. For now, it returns mock inferred frames.
 */
@Injectable()
export class PoseInferenceAdapter {
  private readonly logger = new Logger(PoseInferenceAdapter.name);
  private frameIndex = 0;

  async infer(featureWindow: number[][]): Promise<InferredMotionFrame | null> {
    const demoMode = process.env.DEMO_MODE === 'true';

    if (!demoMode) {
      // TODO: call Python inference service or load ONNX model
      return null;
    }

    return this.generateDemoFrame(featureWindow);
  }

  private generateDemoFrame(
    featureWindow: number[][],
  ): InferredMotionFrame {
    const frame: InferredMotionFrame = {
      timestamp: Date.now(),
      frameIndex: this.frameIndex++,
      keypoints2d: [
        { name: 'head', x: 0.5, y: 0.1, confidence: 0.8 },
        { name: 'left_shoulder', x: 0.4, y: 0.25, confidence: 0.75 },
        { name: 'right_shoulder', x: 0.6, y: 0.25, confidence: 0.75 },
        { name: 'left_hip', x: 0.42, y: 0.5, confidence: 0.7 },
        { name: 'right_hip', x: 0.58, y: 0.5, confidence: 0.7 },
        { name: 'left_knee', x: 0.4, y: 0.7, confidence: 0.6 },
        { name: 'right_knee', x: 0.6, y: 0.7, confidence: 0.6 },
        { name: 'left_ankle', x: 0.38, y: 0.9, confidence: 0.55 },
        { name: 'right_ankle', x: 0.62, y: 0.9, confidence: 0.55 },
      ],
      joints3d: null,
      overallConfidence: 0.65,
      modelVersion: 'demo-v0.1.0',
      experimental: true,
      signalQualityAtCapture: 0.7,
    };

    return frame;
  }
}
