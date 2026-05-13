import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { NormalizedPacket } from '../ingestion/event-bus';
import {
  InferenceResult,
  OnnxInferenceService,
} from '../inference/onnx-inference.service';
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
    @Optional() @Inject(OnnxInferenceService)
    private readonly onnxInferenceService?: OnnxInferenceService,
  ) {}

  async infer(packetWindow: NormalizedPacket[]): Promise<InferredMotionFrame | null> {
    // In DEMO_MODE the ONNX model is a bootstrap placeholder with near-zero output.
    // Always prefer the animated DemoPoseGenerator so the skeleton visualization works.
    if (process.env.DEMO_MODE === 'true' && this.demoPoseGenerator) {
      return this.demoPoseGenerator.generate();
    }

    if (this.onnxInferenceService?.isReady()) {
      const inference = await this.onnxInferenceService.predict(
        this.toFeatureVector(packetWindow),
      );
      if (inference) {
        return this.toMotionFrame(inference, packetWindow);
      }
    }

    if (this.demoPoseGenerator) {
      return this.demoPoseGenerator.generate();
    }

    if (process.env.DEMO_MODE === 'true') {
      return this.generateDemoFrame(packetWindow);
    }

    return null;
  }

  private toFeatureVector(packetWindow: NormalizedPacket[]): number[] {
    return packetWindow.reduce<number[]>((features, packet) => {
      features.push(...packet.amplitude);
      return features;
    }, []);
  }

  private toMotionFrame(
    inference: InferenceResult,
    packetWindow: NormalizedPacket[],
  ): InferredMotionFrame {
    const confidence = this.clamp(inference.modelConfidence);

    return {
      timestamp:
        packetWindow[packetWindow.length - 1]?.timestamp ?? Date.now(),
      frameIndex: this.frameIndex++,
      keypoints2D: inference.keypoints,
      joints3D: null,
      confidence,
      confidenceLevel: this.confidenceLevel(confidence),
      modelVersion: inference.modelVersion,
      experimental: true,
      signalQualityScore: this.windowSignalQuality(packetWindow, confidence),
      validationStatus: 'unvalidated',
    };
  }

  private generateDemoFrame(
    _packetWindow: NormalizedPacket[],
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

  private confidenceLevel(
    confidence: number,
  ): InferredMotionFrame['confidenceLevel'] {
    if (confidence >= 0.7) {
      return 'high';
    }
    if (confidence >= 0.4) {
      return 'medium';
    }
    return 'low';
  }

  private windowSignalQuality(
    packetWindow: NormalizedPacket[],
    fallback: number,
  ): number {
    if (packetWindow.length === 0) {
      return fallback;
    }

    const averageRssi =
      packetWindow.reduce((sum, packet) => sum + packet.rssi, 0) /
      packetWindow.length;

    return this.clamp((averageRssi + 100) / 50);
  }

  private clamp(value: number, min = 0, max = 1): number {
    return Math.max(min, Math.min(max, value));
  }
}
