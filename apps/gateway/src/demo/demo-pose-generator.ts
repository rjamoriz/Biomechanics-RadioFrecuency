import { Injectable, Logger } from '@nestjs/common';
import { InferredMotionFrame, Keypoint2D } from '../pose/pose.types';
import { DemoSimulatorService } from './demo-simulator.service';

/**
 * COCO 17-keypoint names in standard order.
 * Generates animated running skeletons phase-locked to the gait simulation.
 *
 * All frames are marked experimental + synthetic — this is NOT optical motion capture.
 */
const COCO_NAMES = [
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

/** Base standing pose (normalized 0..1 coordinates, lateral view) */
const BASE_POSE: Array<[number, number]> = [
  [0.50, 0.08], // nose
  [0.48, 0.06], // left_eye
  [0.52, 0.06], // right_eye
  [0.46, 0.07], // left_ear
  [0.54, 0.07], // right_ear
  [0.42, 0.22], // left_shoulder
  [0.58, 0.22], // right_shoulder
  [0.38, 0.38], // left_elbow
  [0.62, 0.38], // right_elbow
  [0.36, 0.52], // left_wrist
  [0.64, 0.52], // right_wrist
  [0.44, 0.52], // left_hip
  [0.56, 0.52], // right_hip
  [0.42, 0.72], // left_knee
  [0.58, 0.72], // right_knee
  [0.40, 0.92], // left_ankle
  [0.60, 0.92], // right_ankle
];

/** Base confidence per joint (torso=high, extremities=lower) */
const BASE_CONFIDENCE: number[] = [
  0.80, // nose
  0.70, // left_eye
  0.70, // right_eye
  0.65, // left_ear
  0.65, // right_ear
  0.85, // left_shoulder
  0.85, // right_shoulder
  0.70, // left_elbow
  0.70, // right_elbow
  0.55, // left_wrist
  0.55, // right_wrist
  0.82, // left_hip
  0.82, // right_hip
  0.72, // left_knee
  0.72, // right_knee
  0.60, // left_ankle
  0.60, // right_ankle
];

@Injectable()
export class DemoPoseGenerator {
  private readonly logger = new Logger(DemoPoseGenerator.name);
  private frameIndex = 0;

  constructor(private readonly simulator: DemoSimulatorService) {}

  /**
   * Generate an animated inferred motion frame phase-locked to the
   * current gait simulation state.
   */
  generate(): InferredMotionFrame {
    const phase = this.simulator.getGaitPhase();
    const state = this.simulator.getSimulationState();
    const fatigue = this.simulator.getCurrentFatigue();
    const speedKmh = state.treadmillSpeedKmh;

    const keypoints2D = this.animateKeypoints(phase, speedKmh, fatigue);
    const signalQuality = this.computeSignalQuality(state.signalNoiseLevel);
    const overallConfidence = this.computeOverallConfidence(keypoints2D, signalQuality);

    const frame: InferredMotionFrame = {
      timestamp: Date.now(),
      frameIndex: this.frameIndex++,
      keypoints2D,
      joints3D: null,
      confidence: parseFloat(overallConfidence.toFixed(3)),
      confidenceLevel:
        overallConfidence > 0.7 ? 'high' : overallConfidence > 0.4 ? 'medium' : 'low',
      modelVersion: 'demo-sim-v1.0.0',
      experimental: true,
      signalQualityScore: parseFloat(signalQuality.toFixed(3)),
      validationStatus: 'experimental',
    };

    return frame;
  }

  private animateKeypoints(
    phase: number,
    speedKmh: number,
    fatigue: number,
  ): Keypoint2D[] {
    const sinP = Math.sin(phase);
    const cosP = Math.cos(phase);
    // Opposite phase for contralateral movement
    const sinPOpp = Math.sin(phase + Math.PI);
    const cosOpp = Math.cos(phase + Math.PI);

    // Scale of motion increases with speed
    const motionScale = Math.min(1, speedKmh / 12);
    // Vertical oscillation (center of mass bob)
    const verticalBob = Math.abs(sinP) * 0.03 * motionScale;

    return COCO_NAMES.map((name, i) => {
      const [bx, by] = BASE_POSE[i];
      let dx = 0;
      let dy = -verticalBob; // slight upward bob at mid-stance

      // Fatigue adds jitter
      const fatigueJitter = fatigue * 0.008 * (Math.random() - 0.5);

      const isLeft = name.startsWith('left_');
      const isRight = name.startsWith('right_');
      const sideSign = isLeft ? 1 : isRight ? -1 : 0;
      const sP = isLeft ? sinP : sinPOpp;
      const cP = isLeft ? cosP : cosOpp;

      switch (name) {
        // --- Head region: minimal sway ---
        case 'nose':
        case 'left_eye':
        case 'right_eye':
        case 'left_ear':
        case 'right_ear':
          dx = sinP * 0.008 * motionScale;
          dy += Math.abs(sinP) * 0.006 * motionScale;
          break;

        // --- Shoulders: contralateral rotation ---
        case 'left_shoulder':
        case 'right_shoulder':
          dx = sP * 0.03 * motionScale;
          dy += Math.abs(sP) * 0.01 * motionScale;
          break;

        // --- Elbows: arm swing ---
        case 'left_elbow':
        case 'right_elbow':
          dx = sP * 0.08 * motionScale;
          dy += cP * 0.06 * motionScale;
          break;

        // --- Wrists: larger arm swing ---
        case 'left_wrist':
        case 'right_wrist':
          dx = sP * 0.12 * motionScale;
          dy += cP * 0.10 * motionScale;
          break;

        // --- Hips: slight lateral sway + forward rotation ---
        case 'left_hip':
        case 'right_hip':
          dx = sP * 0.025 * motionScale;
          dy += Math.abs(sP) * 0.015 * motionScale;
          break;

        // --- Knees: large swing, main gait driver ---
        case 'left_knee':
        case 'right_knee':
          dx = sP * 0.10 * motionScale;
          dy += -Math.abs(cP) * 0.08 * motionScale; // knee lifts
          break;

        // --- Ankles: ground contact cycle ---
        case 'left_ankle':
        case 'right_ankle': {
          const swing = sP * 0.14 * motionScale;
          dx = swing;
          // Foot lifts during swing phase, on ground during stance
          const lift = Math.max(0, cP) * 0.12 * motionScale;
          dy += -lift;
          break;
        }
      }

      // Apply confidence degradation from noise level
      const baseConf = BASE_CONFIDENCE[i];
      const noiseConfPenalty =
        this.simulator.getSimulationState().signalNoiseLevel === 'noisy'
          ? 0.15
          : this.simulator.getSimulationState().signalNoiseLevel === 'moderate'
            ? 0.05
            : 0;

      const conf = Math.max(
        0.1,
        baseConf - noiseConfPenalty - fatigue * 0.08 + fatigueJitter,
      );

      return {
        name,
        x: parseFloat((bx + dx + fatigueJitter).toFixed(4)),
        y: parseFloat((by + dy).toFixed(4)),
        confidence: parseFloat(conf.toFixed(3)),
      };
    });
  }

  private computeSignalQuality(noiseLevel: string): number {
    switch (noiseLevel) {
      case 'clean':
        return 0.85 + Math.random() * 0.1;
      case 'moderate':
        return 0.55 + Math.random() * 0.15;
      case 'noisy':
        return 0.25 + Math.random() * 0.2;
      default:
        return 0.7;
    }
  }

  private computeOverallConfidence(
    keypoints: Keypoint2D[],
    signalQuality: number,
  ): number {
    const avgKpConf =
      keypoints.reduce((sum, kp) => sum + kp.confidence, 0) / keypoints.length;
    return avgKpConf * 0.6 + signalQuality * 0.4;
  }
}
