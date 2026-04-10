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

/**
 * Base standing pose (normalized 0..1 coordinates, frontal view).
 * [x, y, z] — x=lateral, y=vertical (0=top), z=depth (forward/back).
 */
const BASE_POSE: Array<[number, number, number]> = [
  [0.50, 0.08, 0.00], // nose
  [0.48, 0.06, 0.00], // left_eye
  [0.52, 0.06, 0.00], // right_eye
  [0.46, 0.07, 0.00], // left_ear
  [0.54, 0.07, 0.00], // right_ear
  [0.42, 0.22, 0.00], // left_shoulder
  [0.58, 0.22, 0.00], // right_shoulder
  [0.38, 0.38, 0.00], // left_elbow
  [0.62, 0.38, 0.00], // right_elbow
  [0.36, 0.52, 0.00], // left_wrist
  [0.64, 0.52, 0.00], // right_wrist
  [0.44, 0.52, 0.00], // left_hip
  [0.56, 0.52, 0.00], // right_hip
  [0.44, 0.72, 0.00], // left_knee
  [0.56, 0.72, 0.00], // right_knee
  [0.44, 0.92, 0.00], // left_ankle
  [0.56, 0.92, 0.00], // right_ankle
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
    // Scale of motion increases with speed (full range at 14 km/h)
    const motionScale = Math.min(1, speedKmh / 14);

    // --- Gait cycle helpers ---
    // Left leg follows `phase`, right leg is π out of phase (contralateral).
    // Arms are opposite to their ipsilateral leg (right arm forward when left leg forward).
    const sinL = Math.sin(phase);
    const cosL = Math.cos(phase);
    const sinR = Math.sin(phase + Math.PI);
    const cosR = Math.cos(phase + Math.PI);

    // Vertical center-of-mass oscillation: bounces TWICE per stride (once per foot contact).
    // Peak height during flight phase, lowest at mid-stance.
    const verticalBob = Math.abs(Math.sin(phase * 2)) * 0.025 * motionScale;

    return COCO_NAMES.map((name, i) => {
      const [bx, by, bz] = BASE_POSE[i];
      let dx = 0; // lateral (minimal for running)
      let dy = -verticalBob; // whole-body vertical oscillation (negative = up)
      let dz = 0; // sagittal depth (forward/back)

      // Fatigue noise
      const fatigueJitter = fatigue * 0.005 * (Math.random() - 0.5);

      // Determine side and corresponding phase signals
      const isLeft = name.startsWith('left_');
      const isRight = name.startsWith('right_');

      // For LEGS: left=sinL, right=sinR
      // For ARMS: contralateral — left arm with right leg, right arm with left leg
      const legSin = isLeft ? sinL : sinR;
      const legCos = isLeft ? cosL : cosR;
      const armSin = isLeft ? sinR : sinL; // opposite to leg
      const armCos = isLeft ? cosR : cosL;

      switch (name) {
        // ── Head: minimal motion, just vertical bob + tiny lateral sway ──
        case 'nose':
        case 'left_eye':
        case 'right_eye':
        case 'left_ear':
        case 'right_ear':
          dx = Math.sin(phase * 2) * 0.004 * motionScale; // tiny lateral sway at double freq
          break;

        // ── Shoulders: slight counter-rotation (lateral) + depth rotation ──
        case 'left_shoulder':
        case 'right_shoulder': {
          const shoulderSin = isLeft ? sinL : sinR;
          dx = shoulderSin * 0.008 * motionScale; // minimal lateral
          dz = -shoulderSin * 0.04 * motionScale; // torso rotation in depth
          break;
        }

        // ── Elbows: arm pump — mainly depth + slight vertical ──
        case 'left_elbow':
        case 'right_elbow':
          dz = armSin * 0.10 * motionScale; // forward/back arm pump
          dy += armCos * 0.03 * motionScale; // slight up/down with pump
          dx = armSin * 0.010 * motionScale; // minimal lateral
          break;

        // ── Wrists: larger arm swing — mainly depth + vertical ──
        case 'left_wrist':
        case 'right_wrist':
          dz = armSin * 0.16 * motionScale; // big forward/back swing
          dy += armCos * 0.06 * motionScale; // wrist rises when arm pumps forward
          dx = armSin * 0.012 * motionScale; // minimal lateral
          break;

        // ── Hips: very slight lateral sway + vertical drop on stance side ──
        case 'left_hip':
        case 'right_hip': {
          dx = legSin * 0.008 * motionScale; // minimal hip sway
          // Slight hip drop on swing side (Trendelenburg-like)
          dy += Math.max(0, legSin) * 0.010 * motionScale;
          dz = legSin * 0.015 * motionScale; // tiny forward/back hip rotation
          break;
        }

        // ── Knees: PRIMARY running motion — big vertical lift during swing ──
        case 'left_knee':
        case 'right_knee': {
          // Knee LIFTS during swing phase (when sin > 0), stays low during stance
          const kneeLift = Math.max(0, legSin);
          dy += -kneeLift * 0.14 * motionScale; // significant upward lift (negative = up)
          // Knee moves forward during swing, backward during stance
          dz = legSin * 0.08 * motionScale;
          // Minimal lateral motion
          dx = legSin * 0.006 * motionScale;
          break;
        }

        // ── Ankles: ground contact cycle — lifts during swing, planted during stance ──
        case 'left_ankle':
        case 'right_ankle': {
          // Foot lifts behind and up during swing phase (cos < 0 = back-kick)
          const swingPhase = Math.max(0, legSin);
          const backKick = Math.max(0, -legCos);
          // Vertical: lift foot during swing, keep planted during stance
          dy += -swingPhase * 0.10 * motionScale; // foot rises during swing
          dy += -backKick * 0.06 * motionScale; // heel kick-up at toe-off
          // Depth: foot sweeps forward during swing, backward at push-off
          dz = legSin * 0.12 * motionScale;
          // Minimal lateral
          dx = legSin * 0.005 * motionScale;
          break;
        }
      }

      // Confidence degradation from noise
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
        z: parseFloat((bz + dz).toFixed(4)),
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
