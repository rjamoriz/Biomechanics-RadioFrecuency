import { Injectable } from '@nestjs/common';

/**
 * Body Velocity Profile (BVP) extraction from CSI Doppler-shift features.
 *
 * Computes velocity contributions from phase rate-of-change, mapping
 * CSI temporal dynamics to body movement speed profiles.
 *
 * Key uses in treadmill biomechanics:
 *   - stride velocity estimation
 *   - flight phase detection (rapid velocity change)
 *   - impact detection (sharp deceleration)
 *
 * Inspired by RuView's BVP signal processing.
 */
@Injectable()
export class BodyVelocityProfile {
  /** Speed of light (m/s) */
  private static readonly C = 3e8;

  /**
   * Compute instantaneous velocity from unwrapped phase time series.
   *
   * Uses the Doppler relationship:
   *   v = (Δφ / Δt) × (λ / 4π)
   *
   * where λ = c / f (carrier frequency).
   *
   * @param unwrappedPhase  Unwrapped phase (radians) — use PhaseUnwrapper first
   * @param sampleRate      Sample rate in Hz
   * @param carrierFreqHz   Carrier frequency (default 2.4 GHz for WiFi)
   * @returns velocity profile in m/s
   */
  computeVelocity(
    unwrappedPhase: number[],
    sampleRate: number,
    carrierFreqHz = 2.4e9,
  ): number[] {
    if (unwrappedPhase.length < 2) return [];

    const wavelength = BodyVelocityProfile.C / carrierFreqHz;
    const scale = (wavelength * sampleRate) / (4 * Math.PI);
    const n = unwrappedPhase.length;
    const velocity = new Array<number>(n - 1);

    for (let i = 1; i < n; i++) {
      velocity[i - 1] = (unwrappedPhase[i] - unwrappedPhase[i - 1]) * scale;
    }

    return velocity;
  }

  /**
   * Compute mean velocity profile across multiple subcarriers.
   *
   * @param unwrappedPhases  Array of unwrapped phase series (one per subcarrier)
   * @param sampleRate       Sample rate
   * @param carrierFreqHz    Carrier frequency
   * @returns Averaged velocity profile
   */
  computeAverageVelocity(
    unwrappedPhases: number[][],
    sampleRate: number,
    carrierFreqHz = 2.4e9,
  ): number[] {
    if (unwrappedPhases.length === 0) return [];

    const velocities = unwrappedPhases.map((p) =>
      this.computeVelocity(p, sampleRate, carrierFreqHz),
    );

    const minLen = Math.min(...velocities.map((v) => v.length));
    const result = new Array<number>(minLen).fill(0);

    for (const vel of velocities) {
      for (let i = 0; i < minLen; i++) {
        result[i] += vel[i] / velocities.length;
      }
    }

    return result;
  }

  /**
   * Detect impact events (foot strikes) from velocity zero-crossings.
   * A foot strike is characterized by a rapid deceleration.
   *
   * @param velocity       Velocity profile in m/s
   * @param minPeakSpeed   Minimum speed before deceleration to count as impact
   * @returns Indices of detected impacts
   */
  detectImpacts(velocity: number[], minPeakSpeed = 0.05): number[] {
    const impacts: number[] = [];

    for (let i = 1; i < velocity.length; i++) {
      // Negative-going zero crossing with sufficient preceding speed
      if (
        velocity[i - 1] > minPeakSpeed &&
        velocity[i] <= 0
      ) {
        impacts.push(i);
      }
    }

    return impacts;
  }

  /**
   * Compute peak body speed within each stride cycle (impact-to-impact).
   */
  peakSpeedPerStride(
    velocity: number[],
    impactIndices: number[],
  ): number[] {
    if (impactIndices.length < 2) return [];

    const peaks: number[] = [];
    for (let s = 0; s < impactIndices.length - 1; s++) {
      const start = impactIndices[s];
      const end = impactIndices[s + 1];
      let maxSpeed = 0;
      for (let i = start; i < end && i < velocity.length; i++) {
        maxSpeed = Math.max(maxSpeed, Math.abs(velocity[i]));
      }
      peaks.push(maxSpeed);
    }

    return peaks;
  }
}
