import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { InferredMotionFrame } from './pose.types';
import { DemoPoseGenerator } from '../demo/demo-pose-generator';

/**
 * Adapter for pose inference. In production, this calls a local Python service
 * or loads an ONNX model. In demo mode, it uses DemoPoseGenerator for animated
 * phase-locked skeletons, falling back to a static mock if unavailable.
 */
@Injectable()
export class PoseInferenceAdapter {
  private readonly logger = new Logger(PoseInferenceAdapter.name);
  private frameIndex = 0;

  constructor(
    @Optional() @Inject(DemoPoseGenerator)
    private readonly demoPoseGenerator?: DemoPoseGenerator,
  ) {}

  async infer(featureWindow: number[][]): Promise<InferredMotionFrame | null> {
    const demoMode = process.env.DEMO_MODE === 'true';

    if (!demoMode) {
      // TODO: call Python inference service or load ONNX model
      return null;
    }

    // Prefer rich animated demo if DemoPoseGenerator is available
    if (this.demoPoseGenerator) {
      return this.demoPoseGenerator.generate();
    }

    return this.generateDemoFrame(featureWindow);
  }

  private generateDemoFrame(
    featureWindow: number[][],
  ): InferredMotionFrame {
    const frame: InferredMotionFrame = {
      timestamp: Date.now(),
      frameIndex: this.frameIndex++,
      keypoints2D: [
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
      joints3D: null,
      confidence: 0.65,
      confidenceLevel: 'medium',
      modelVersion: 'demo-v0.1.0',
      experimental: true,
      signalQualityScore: 0.7,
      validationStatus: 'experimental',
    };

    return frame;
  }
}
