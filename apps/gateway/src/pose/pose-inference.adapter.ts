import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import axios from 'axios';
import { InferredMotionFrame, Keypoint2D } from './pose.types';
import { DemoPoseGenerator } from '../demo/demo-pose-generator';

interface MlPoseKeypoint {
  name: string;
  x: number;
  y: number;
  confidence: number;
}

interface MlPoseResponse {
  timestamp: number;
  keypoints: MlPoseKeypoint[];
  model_version: string;
  confidence: number;
  signal_quality: number;
  experimental: boolean;
  validation_status: string;
}

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
    const inferenceUrl = process.env.INFERENCE_SERVICE_URL;

    // Production mode with ML inference server
    if (!demoMode && inferenceUrl) {
      try {
        const { data } = await axios.post<MlPoseResponse>(
          `${inferenceUrl}/infer/pose`,
          { amplitude_window: featureWindow, timestamp: Date.now() },
          { timeout: 2000 },
        );
        return this.adaptMlResponse(data);
      } catch (err) {
        this.logger.warn(
          `ML pose inference failed: ${(err as Error).message} — skipping frame`,
        );
        return null;
      }
    }

    // Production mode without ML server — no pose available
    if (!demoMode) {
      return null;
    }

    // Prefer rich animated demo if DemoPoseGenerator is available
    if (this.demoPoseGenerator) {
      return this.demoPoseGenerator.generate();
    }

    return this.generateDemoFrame(featureWindow);
  }

  private adaptMlResponse(data: MlPoseResponse): InferredMotionFrame {
    const confidence = data.confidence ?? 0;
    const keypoints2D: Keypoint2D[] = (data.keypoints ?? []).map((kp) => ({
      name: kp.name,
      x: kp.x,
      y: kp.y,
      confidence: kp.confidence,
    }));
    return {
      timestamp: data.timestamp,
      frameIndex: this.frameIndex++,
      keypoints2D,
      joints3D: null,
      confidence,
      confidenceLevel: confidence >= 0.7 ? 'high' : confidence >= 0.4 ? 'medium' : 'low',
      modelVersion: data.model_version ?? 'ml-unknown',
      experimental: true,
      signalQualityScore: data.signal_quality ?? 0,
      validationStatus: 'experimental',
    };
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
