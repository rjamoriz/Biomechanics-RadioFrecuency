import { Injectable } from '@nestjs/common';

/** Validation status for biomechanics proxy metrics. */
export type ValidationStatus =
  | 'unvalidated'
  | 'experimental'
  | 'station_validated'
  | 'externally_validated';

/** Method used to estimate stride length. */
export type StrideLengthMethod = 'belt_speed' | 'keypoint_displacement';

/** Result of a stride-length estimation. */
export interface StrideLengthEstimate {
  strideLengthM: number;
  method: StrideLengthMethod;
  confidence: number;
  validationStatus: ValidationStatus;
}

/** Spatial position of a body keypoint at a given time. */
export interface KeypointPosition {
  timestampMs: number;
  x: number;
  y: number;
}

// Running-specific biomechanical bounds (metres)
const MIN_STRIDE_M = 0.5;
const MAX_STRIDE_M = 3.5;

/**
 * Estimates stride length from cadence + treadmill belt speed,
 * or from keypoint spatial displacement when available.
 *
 * Primary method uses the treadmill belt speed as ground truth:
 *   strideLengthM = beltSpeedMps / stepsPerSecond
 *   where stepsPerSecond = cadenceSpm / 60, and one stride = 2 steps.
 *
 * All outputs are proxy / estimated — not directly measured.
 */
@Injectable()
export class StrideLengthEstimator {
  /**
   * Estimate stride length from treadmill belt speed and cadence.
   *
   * @param cadenceSpm   Estimated cadence in steps per minute
   * @param beltSpeedMps Treadmill belt speed in metres per second
   * @param signalQuality Optional signal quality score (0–1) for confidence weighting
   */
  fromBeltSpeed(
    cadenceSpm: number,
    beltSpeedMps: number,
    signalQuality = 1.0,
  ): StrideLengthEstimate | null {
    if (cadenceSpm <= 0 || beltSpeedMps <= 0) return null;

    // strides per second = cadence / 60 / 2 (2 steps per stride)
    const stridesPerSec = cadenceSpm / 60 / 2;
    const strideLengthM = beltSpeedMps / stridesPerSec;

    const inBounds = strideLengthM >= MIN_STRIDE_M && strideLengthM <= MAX_STRIDE_M;
    const boundsConfidence = inBounds ? 1.0 : 0.3;

    // Belt speed is trustworthy; confidence mostly depends on cadence quality
    const confidence =
      Math.round(
        Math.min(1, signalQuality * 0.5 + boundsConfidence * 0.5) * 100,
      ) / 100;

    return {
      strideLengthM: Math.round(strideLengthM * 1000) / 1000,
      method: 'belt_speed',
      confidence,
      validationStatus: inBounds ? 'unvalidated' : 'experimental',
    };
  }

  /**
   * Estimate stride length from keypoint displacement over one stride cycle.
   *
   * @param positions Array of keypoint positions spanning one stride
   * @param signalQuality Optional signal quality score (0–1)
   */
  fromKeypointDisplacement(
    positions: KeypointPosition[],
    signalQuality = 1.0,
  ): StrideLengthEstimate | null {
    if (positions.length < 3) return null;

    let totalDisplacement = 0;
    for (let i = 1; i < positions.length; i++) {
      const dx = positions[i].x - positions[i - 1].x;
      const dy = positions[i].y - positions[i - 1].y;
      totalDisplacement += Math.sqrt(dx * dx + dy * dy);
    }

    const inBounds =
      totalDisplacement >= MIN_STRIDE_M && totalDisplacement <= MAX_STRIDE_M;
    const boundsConfidence = inBounds ? 1.0 : 0.3;
    // Keypoint displacement is inferred, so lower base confidence
    const confidence =
      Math.round(
        Math.min(1, signalQuality * 0.35 + boundsConfidence * 0.35 + 0.1) * 100,
      ) / 100;

    return {
      strideLengthM: Math.round(totalDisplacement * 1000) / 1000,
      method: 'keypoint_displacement',
      confidence,
      validationStatus: 'experimental',
    };
  }
}
