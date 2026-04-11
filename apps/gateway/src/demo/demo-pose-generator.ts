import { Injectable, Logger } from '@nestjs/common';
import { InferredMotionFrame, Keypoint2D, EstimatedRunningForces } from '../pose/pose.types';
import { DemoSimulatorService } from './demo-simulator.service';

/**
 * COCO 17-keypoint names in standard order.
 * Generates animated running skeletons phase-locked to the gait simulation.
 *
 * All frames are marked experimental + synthetic — this is NOT optical motion capture.
 * Force estimates are rough synthetic proxy values derived from biomechanics ratios,
 * NOT clinical-grade measurements.
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
   * current gait simulation state, with estimated running forces.
   */
  generate(): InferredMotionFrame {
    const phase = this.simulator.getGaitPhase();
    const state = this.simulator.getSimulationState();
    const fatigue = this.simulator.getCurrentFatigue();
    const speedKmh = state.treadmillSpeedKmh;

    const keypoints2D = this.animateKeypoints(phase, speedKmh, fatigue);
    const signalQuality = this.computeSignalQuality(state.signalNoiseLevel);
    const overallConfidence = this.computeOverallConfidence(keypoints2D, signalQuality);

    // --- Estimated force computation (synthetic proxy, NOT clinical-grade) ---
    const estimatedForces = this.computeEstimatedForces(
      speedKmh,
      state.weightKg,
      state.heightCm,
      fatigue,
    );

    const frame: InferredMotionFrame = {
      timestamp: Date.now(),
      frameIndex: this.frameIndex++,
      keypoints2D,
      joints3D: null,
      confidence: parseFloat(overallConfidence.toFixed(3)),
      confidenceLevel:
        overallConfidence > 0.7 ? 'high' : overallConfidence > 0.4 ? 'medium' : 'low',
      modelVersion: 'demo-sim-v2.0.0',
      experimental: true,
      signalQualityScore: parseFloat(signalQuality.toFixed(3)),
      validationStatus: 'experimental',
      estimatedForces,
    };

    return frame;
  }

  /**
   * Realistic running animation based on biomechanics principles.
   *
   * Phase convention: left leg follows `phase`, right leg is π out of phase.
   * Arms are contralateral (right arm forward when left leg forward).
   *
   * Key biomechanics modeled:
   * - Forward trunk lean (5-15° increasing with speed)
   * - Dramatic knee drive (thigh approaches horizontal at high speeds)
   * - Heel kick-up (heel reaches near buttock during fast running)
   * - Aggressive sagittal-plane arm pump (hands rise to chin height)
   * - Flight phase (COM rises when both feet leave ground at >10 km/h)
   * - Asymmetric gait cycle (stance shorter than swing at speed)
   * - Pelvis counter-rotation with shoulders
   * - Ankle dorsiflexion during swing, plantarflexion at toe-off
   */
  private animateKeypoints(
    phase: number,
    speedKmh: number,
    fatigue: number,
  ): Keypoint2D[] {
    // Motion amplitude scale: 0 at rest, 1.0 at 14 km/h, up to 1.3 at sprint
    const motionScale = Math.min(1.3, speedKmh / 14);
    // Speed factor: 0 = slow jog (6 km/h), 1 = near-sprint (20 km/h)
    const speedFactor = Math.max(0, Math.min(1, (speedKmh - 6) / 14));

    // ── Gait cycle signals ──
    const sinL = Math.sin(phase);
    const cosL = Math.cos(phase);
    const sinR = Math.sin(phase + Math.PI);
    const cosR = Math.cos(phase + Math.PI);

    // ── Forward trunk lean (5-15° with speed) ──
    // Runners lean forward progressively more as pace increases
    const trunkLeanFactor = (0.02 + 0.02 * speedFactor) * motionScale;

    // ── Vertical center-of-mass oscillation ──
    // Running has double-frequency bounce (once per foot contact).
    // Flight phase amplitude increases with speed.
    const flightAmplitude = 0.04 + 0.02 * speedFactor;
    const verticalBob = Math.abs(Math.sin(phase * 2)) * flightAmplitude * motionScale;

    // ── Pelvis rotation (counter to shoulders in transverse plane) ──
    const pelvisRotation = sinL * 0.02 * motionScale;

    // ── Asymmetric stance/swing: at higher speeds, swing is sharper & longer ──
    // Power < 1 makes the positive (swing) phase more pronounced / sustained
    const stanceSwingPower = 0.7 + 0.3 * (1 - speedFactor);

    // Cache noise level to avoid repeated getSimulationState calls
    const noiseLevel = this.simulator.getSimulationState().signalNoiseLevel;
    const noiseConfPenalty =
      noiseLevel === 'noisy' ? 0.15 : noiseLevel === 'moderate' ? 0.05 : 0;

    return COCO_NAMES.map((name, i) => {
      const [bx, by, bz] = BASE_POSE[i];
      let dx = 0; // lateral
      let dy = -verticalBob; // whole-body vertical oscillation (negative = up)
      let dz = 0; // sagittal depth (forward/back)

      // Fatigue-induced movement noise
      const fatigueJitter = fatigue * 0.005 * (Math.random() - 0.5);

      const isLeft = name.startsWith('left_');

      // Leg signals: ipsilateral
      const legSin = isLeft ? sinL : sinR;
      const legCos = isLeft ? cosL : cosR;
      // Arm signals: contralateral (left arm swings with right leg)
      const armSin = isLeft ? sinR : sinL;

      switch (name) {
        // ── Head & face: trunk lean + minimal lateral sway ──
        case 'nose':
        case 'left_eye':
        case 'right_eye':
        case 'left_ear':
        case 'right_ear':
          dy += trunkLeanFactor; // forward lean lowers head slightly
          dz = trunkLeanFactor * 2; // forward shift in depth
          dx = Math.sin(phase * 2) * 0.005 * motionScale; // tiny lateral sway at 2x freq
          break;

        // ── Shoulders: counter-rotation to pelvis + trunk lean ──
        case 'left_shoulder':
        case 'right_shoulder': {
          const shoulderSin = isLeft ? sinL : sinR;
          dy += trunkLeanFactor * 0.7;
          // Shoulder rotation counter to pelvis in depth
          dz =
            trunkLeanFactor * 1.5 - shoulderSin * 0.05 * motionScale;
          dx = shoulderSin * 0.012 * motionScale;
          break;
        }

        // ── Elbows: 90° arm pump — aggressive sagittal plane motion ──
        case 'left_elbow':
        case 'right_elbow': {
          // Depth: 0.16-0.20 range at full speed
          dz = armSin * (0.16 + 0.04 * speedFactor) * motionScale;
          // Vertical: elbow rises with forward pump
          dy += armSin * 0.05 * motionScale + trunkLeanFactor * 0.5;
          dx = armSin * 0.012 * motionScale;
          break;
        }

        // ── Wrists: large arm swing — hands rise to chin height on forward pump ──
        case 'left_wrist':
        case 'right_wrist': {
          // Depth: 0.22-0.28 range at full speed
          dz = armSin * (0.24 + 0.04 * speedFactor) * motionScale;
          // Hands rise significantly forward (chin height), drop slightly behind
          dy +=
            -Math.max(0, armSin) *
            (0.10 + 0.04 * speedFactor) *
            motionScale;
          dy += Math.max(0, -armSin) * 0.03 * motionScale;
          dy += trunkLeanFactor * 0.3;
          dx = armSin * 0.015 * motionScale;
          break;
        }

        // ── Hips: pelvis rotation + Trendelenburg + lateral weight shift ──
        case 'left_hip':
        case 'right_hip': {
          dx = legSin * 0.012 * motionScale;
          // Pelvis drop on swing side (Trendelenburg effect)
          dy += Math.max(0, legSin) * 0.012 * motionScale;
          // Pelvis rotation (counter to shoulders)
          dz =
            legSin * 0.025 * motionScale +
            pelvisRotation * (isLeft ? 1 : -1);
          break;
        }

        // ── Knees: DRAMATIC high knee drive during swing ──
        case 'left_knee':
        case 'right_knee': {
          // Asymmetric swing lift: sharper at speed (power < 1)
          const swingKneeLift = Math.pow(
            Math.max(0, legSin),
            stanceSwingPower,
          );
          // Vertical lift: 0.22-0.28 range at full speed (thigh near horizontal)
          dy +=
            -swingKneeLift *
            (0.24 + 0.04 * speedFactor) *
            motionScale;
          // Forward drive during swing, backward during stance
          dz = legSin * (0.10 + 0.04 * speedFactor) * motionScale;
          dx = legSin * 0.008 * motionScale;
          break;
        }

        // ── Ankles: complex trajectory — dorsiflexion + heel kick-up + toe-off ──
        case 'left_ankle':
        case 'right_ankle': {
          // Swing lift: foot rises during forward swing
          const swingAnkleLift = Math.pow(
            Math.max(0, legSin),
            stanceSwingPower,
          );
          // Heel kick-up peaks when cos < 0 (back phase of cycle)
          const heelKickUp = Math.pow(Math.max(0, -legCos), 0.8);

          // Vertical: foot lifts during swing + heel kick-up toward buttock
          // Ankle vertical lift: 0.18-0.22 at full speed
          dy +=
            -swingAnkleLift *
            (0.12 + 0.02 * speedFactor) *
            motionScale;
          dy +=
            -heelKickUp * (0.06 + 0.04 * speedFactor) * motionScale;

          // Depth: sweeps forward during swing, back at push-off
          // Ankle depth swing: 0.20-0.25 at full speed
          dz = legSin * (0.20 + 0.05 * speedFactor) * motionScale;
          // Extra backward depth during heel kick-up
          const backKickPhase =
            Math.max(0, -legCos) * Math.max(0, legSin);
          dz += -backKickPhase * 0.08 * motionScale;

          dx = legSin * 0.006 * motionScale;
          break;
        }
      }

      // Confidence degradation from noise + fatigue
      const baseConf = BASE_CONFIDENCE[i];
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

  /**
   * Compute estimated running forces — synthetic proxy values based on
   * biomechanics ratios scaled by speed and body weight.
   *
   * These are NOT clinical-grade measurements. They use simplified models:
   * - GRF peak ≈ 2.0-3.0x BW during running (increases with speed)
   * - Muscle forces scaled from published biomechanics ratios
   * - Speed-dependent variability added for realism
   *
   * References: Keller et al. 1996, Hamner et al. 2010 (ratios only)
   */
  private computeEstimatedForces(
    speedKmh: number,
    weightKg: number,
    heightCm: number,
    fatigue: number,
  ): EstimatedRunningForces {
    const BW_N = weightKg * 9.81;
    const jitter = () => 1 + (Math.random() - 0.5) * 0.06; // ±3% variability

    // GRF peak: ~2.0x BW at jog (6 km/h), ~2.8x BW at 14 km/h
    const grfMultiplier = 2.0 + speedKmh * 0.06;
    // Fatigue increases impact slightly (deteriorating form)
    const fatigueImpactBoost = 1 + fatigue * 0.08;
    const groundReactionForceN =
      BW_N * grfMultiplier * fatigueImpactBoost * jitter();

    // Braking force at heel strike: 0.3-0.5x BW
    const brakingForceN =
      BW_N * (0.30 + speedKmh * 0.012) * jitter();

    // Propulsive force at toe-off: 0.3-0.5x BW
    const propulsiveForceN =
      BW_N * (0.30 + speedKmh * 0.014) * jitter();

    // Impact loading rate: GRF / contact time (shorter contact at speed)
    const contactTimeS = Math.max(0.12, 0.30 - speedKmh * 0.008);
    const impactLoadingRateNPerS =
      (groundReactionForceN * 0.6) / contactTimeS;

    // Muscle force estimates (rough synthetic, scaled from BW)
    // Quadriceps: 3-5x BW during stance (eccentric braking + knee extension)
    const quadricepsPeak =
      BW_N * (3.0 + speedKmh * 0.12) * fatigueImpactBoost * jitter();

    // Hamstrings: 1.5-3x BW during late swing + early stance
    const hamstringsPeak =
      BW_N * (1.5 + speedKmh * 0.09) * jitter();

    // Gastrocnemius: 2-4x BW during push-off
    const gastrocnemiusPeak =
      BW_N * (2.0 + speedKmh * 0.12) * jitter();

    // Gluteus maximus: 1.5-2.5x BW during early stance (hip extension)
    const gluteMaxPeak =
      BW_N * (1.5 + speedKmh * 0.06) * jitter();

    // Tibialis anterior: 0.3-0.5x BW during swing (dorsiflexion)
    const tibialisAnteriorPeak =
      BW_N * (0.3 + speedKmh * 0.01) * jitter();

    return {
      groundReactionForceN: parseFloat(groundReactionForceN.toFixed(1)),
      brakingForceN: parseFloat(brakingForceN.toFixed(1)),
      propulsiveForceN: parseFloat(propulsiveForceN.toFixed(1)),
      impactLoadingRateNPerS: parseFloat(impactLoadingRateNPerS.toFixed(0)),
      muscleForcesN: {
        quadricepsPeak: parseFloat(quadricepsPeak.toFixed(1)),
        hamstringsPeak: parseFloat(hamstringsPeak.toFixed(1)),
        gastrocnemiusPeak: parseFloat(gastrocnemiusPeak.toFixed(1)),
        gluteMaxPeak: parseFloat(gluteMaxPeak.toFixed(1)),
        tibialisAnteriorPeak: parseFloat(tibialisAnteriorPeak.toFixed(1)),
      },
      runnerWeightN: parseFloat(BW_N.toFixed(1)),
      speedKmh,
      disclaimer:
        'Estimated proxy forces from simplified biomechanics model. ' +
        'NOT clinical-grade. Do not use for medical or injury assessment.',
    };
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
