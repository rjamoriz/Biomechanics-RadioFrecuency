import { Injectable, Logger } from '@nestjs/common';
import { NormalizedPacket } from '../ingestion/event-bus';

/**
 * Extracts a flattened feature vector from a window of CSI packets
 * suitable as input for the ONNX pose/proxy inference model.
 *
 * Per subcarrier features:
 *   - mean amplitude
 *   - std amplitude
 *   - mean phase
 *   - phase rate of change (first-difference mean)
 *   - spectral centroid estimate
 *
 * The result is a 1D vector of length: numSubcarriers × 5
 */
@Injectable()
export class FeatureExtractor {
  private readonly logger = new Logger(FeatureExtractor.name);

  /**
   * Extract a feature vector from a window of normalized CSI packets.
   *
   * @param window - Array of NormalizedPacket (must have consistent subcarrier count)
   * @param windowSize - Minimum number of packets required
   * @returns Flat feature vector, or null if validation fails
   */
  extractFeatures(window: NormalizedPacket[], windowSize: number): number[] | null {
    if (window.length < windowSize) {
      this.logger.debug(
        `Window too small: ${window.length} < ${windowSize} — skipping feature extraction`,
      );
      return null;
    }

    const numSubcarriers = window[0].amplitude.length;
    if (numSubcarriers === 0) {
      this.logger.warn('Empty amplitude array in window — skipping');
      return null;
    }

    const features: number[] = [];

    for (let sc = 0; sc < numSubcarriers; sc++) {
      // Collect amplitude and phase series for this subcarrier
      const amps: number[] = [];
      const phases: number[] = [];

      for (const pkt of window) {
        const a = pkt.amplitude[sc];
        const p = pkt.phase[sc];

        if (a === undefined || p === undefined || !isFinite(a) || !isFinite(p)) {
          // NaN / undefined guard — skip this subcarrier entirely
          break;
        }
        amps.push(a);
        phases.push(p);
      }

      if (amps.length < windowSize) {
        // Subcarrier had invalid data — zero-fill features
        features.push(0, 0, 0, 0, 0);
        continue;
      }

      features.push(
        mean(amps),
        std(amps),
        mean(phases),
        phaseRateOfChange(phases),
        spectralCentroidEstimate(amps),
      );
    }

    // Final NaN sweep
    if (features.some((v) => !isFinite(v))) {
      this.logger.warn('Feature vector contains NaN/Inf — returning null');
      return null;
    }

    return features;
  }
}

/* ── pure math helpers ──────────────────────── */

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (const v of arr) sum += v;
  return sum / arr.length;
}

function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let sumSq = 0;
  for (const v of arr) sumSq += (v - m) * (v - m);
  return Math.sqrt(sumSq / arr.length);
}

/** Mean absolute first-difference of the phase series. */
function phaseRateOfChange(phases: number[]): number {
  if (phases.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < phases.length; i++) {
    let diff = phases[i] - phases[i - 1];
    // Unwrap ±π jumps
    if (diff > Math.PI) diff -= 2 * Math.PI;
    else if (diff < -Math.PI) diff += 2 * Math.PI;
    sum += Math.abs(diff);
  }
  return sum / (phases.length - 1);
}

/**
 * Approximate spectral centroid from the amplitude series via FFT-like energy weighting.
 *
 * Uses a discrete estimation: sum(k * |DFT[k]|²) / sum(|DFT[k]|²)
 * where k is the frequency bin index.
 */
function spectralCentroidEstimate(amps: number[]): number {
  const n = amps.length;
  if (n < 2) return 0;

  // Remove DC
  const m = mean(amps);
  const centered = amps.map((a) => a - m);

  // Compute power per frequency bin via naive DFT magnitude squared
  // (only first half — Nyquist)
  const halfN = Math.floor(n / 2);
  let numerator = 0;
  let denominator = 0;

  for (let k = 1; k <= halfN; k++) {
    let realPart = 0;
    let imagPart = 0;
    const angle = (2 * Math.PI * k) / n;
    for (let t = 0; t < n; t++) {
      realPart += centered[t] * Math.cos(angle * t);
      imagPart -= centered[t] * Math.sin(angle * t);
    }
    const power = realPart * realPart + imagPart * imagPart;
    numerator += k * power;
    denominator += power;
  }

  return denominator > 0 ? numerator / denominator : 0;
}
