import { Injectable } from '@nestjs/common';

/**
 * Selects the most informative CSI subcarriers for downstream processing.
 *
 * Not all 52/56 OFDM subcarriers carry useful motion information — some are
 * dominated by noise or static multipath. This service ranks subcarriers
 * by temporal variance and selects a stable subset for metric extraction.
 *
 * Inspired by RuView's subcarrier selection algorithm.
 */
@Injectable()
export class SubcarrierSelector {
  /**
   * Select top-K subcarriers ranked by amplitude variance (motion energy).
   *
   * @param amplitudeMatrix  [subcarriers × samples] — each row is one subcarrier's amplitude time series
   * @param topK             Number of subcarriers to select
   * @returns Indices of the selected subcarriers, sorted by variance descending
   */
  selectByVariance(amplitudeMatrix: number[][], topK: number): number[] {
    const ranked = amplitudeMatrix
      .map((row, idx) => ({ idx, variance: this.variance(row) }))
      .sort((a, b) => b.variance - a.variance);

    return ranked.slice(0, Math.min(topK, ranked.length)).map((r) => r.idx);
  }

  /**
   * Select subcarriers with variance above a dynamic threshold.
   * Rejects both silent subcarriers (variance ≈ 0) and excessively
   * noisy ones (variance > mean + 3σ of all variances).
   */
  selectByDynamicThreshold(amplitudeMatrix: number[][]): number[] {
    const variances = amplitudeMatrix.map((row) => this.variance(row));
    const meanVar = this.mean(variances);
    const stdVar = this.std(variances, meanVar);

    const lowerBound = meanVar * 0.1;
    const upperBound = meanVar + 3 * stdVar;

    return variances
      .map((v, idx) => ({ idx, v }))
      .filter((item) => item.v > lowerBound && item.v < upperBound)
      .map((item) => item.idx);
  }

  /**
   * Compute average amplitude across selected subcarrier indices.
   */
  averageSelectedAmplitude(
    amplitudeMatrix: number[][],
    indices: number[],
  ): number[] {
    if (indices.length === 0) return [];

    const sampleCount = amplitudeMatrix[0]?.length ?? 0;
    const result = new Array<number>(sampleCount).fill(0);

    for (const idx of indices) {
      const row = amplitudeMatrix[idx];
      if (!row) continue;
      for (let s = 0; s < sampleCount; s++) {
        result[s] += (row[s] ?? 0) / indices.length;
      }
    }

    return result;
  }

  private variance(arr: number[]): number {
    if (arr.length < 2) return 0;
    const m = this.mean(arr);
    return arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / (arr.length - 1);
  }

  private mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
  }

  private std(arr: number[], mean?: number): number {
    const m = mean ?? this.mean(arr);
    return Math.sqrt(this.variance(arr.map((v) => v - m + m))); // recompute with full array
  }
}
