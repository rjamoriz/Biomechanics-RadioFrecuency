import { Injectable } from '@nestjs/common';

/**
 * Removes 2π discontinuities from CSI phase data.
 *
 * CSI phase values are wrapped to [-π, π]. For temporal analysis
 * (breathing, heart rate, motion tracking) the phase must be unwrapped
 * to produce a continuous signal.
 */
@Injectable()
export class PhaseUnwrapper {
  /**
   * Unwrap a single-subcarrier phase time series.
   *
   * @param phases Array of wrapped phase values (radians)
   * @returns Unwrapped continuous phase
   */
  unwrap(phases: number[]): number[] {
    if (phases.length === 0) return [];

    const result = new Array<number>(phases.length);
    result[0] = phases[0];
    let cumOffset = 0;

    for (let i = 1; i < phases.length; i++) {
      let diff = phases[i] - phases[i - 1];

      if (diff > Math.PI) {
        cumOffset -= 2 * Math.PI;
      } else if (diff < -Math.PI) {
        cumOffset += 2 * Math.PI;
      }

      result[i] = phases[i] + cumOffset;
    }

    return result;
  }

  /**
   * Unwrap a matrix of [subcarriers × samples] phase data.
   *
   * @param phaseMatrix  Each row is a subcarrier's phase time series
   * @returns Unwrapped matrix (same shape)
   */
  unwrapMatrix(phaseMatrix: number[][]): number[][] {
    return phaseMatrix.map((row) => this.unwrap(row));
  }

  /**
   * Remove linear phase drift often caused by clock offset (SFO/STO).
   * Fits and subtracts a linear trend from unwrapped phase.
   */
  detrend(signal: number[]): number[] {
    const n = signal.length;
    if (n < 2) return [...signal];

    // Least-squares linear fit
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += signal[i];
      sumXY += i * signal[i];
      sumX2 += i * i;
    }

    const denom = n * sumX2 - sumX * sumX;
    if (Math.abs(denom) < 1e-12) return [...signal];

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    return signal.map((v, i) => v - (slope * i + intercept));
  }
}
