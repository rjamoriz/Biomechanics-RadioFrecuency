import { Injectable } from '@nestjs/common';

/**
 * Hampel filter for robust outlier rejection in CSI time series.
 *
 * Uses a sliding window of medians and median absolute deviations (MAD)
 * to detect and replace outliers — critical for noisy RF environments.
 *
 * Inspired by RuView's research-grade Hampel implementation.
 */
@Injectable()
export class HampelFilter {
  /** Scale constant for Gaussian MAD → σ equivalence */
  private static readonly MAD_SCALE = 1.4826;

  /**
   * Apply Hampel filter to the given signal.
   *
   * @param signal   Input samples
   * @param windowHalf  Half-window size (default 3 → 7-sample window)
   * @param threshold   Number of MADs to consider outlier (default 3)
   * @returns filtered signal with outliers replaced by local median
   */
  filter(signal: number[], windowHalf = 3, threshold = 3): number[] {
    const n = signal.length;
    if (n === 0) return [];

    const result = new Array<number>(n);

    for (let i = 0; i < n; i++) {
      const lo = Math.max(0, i - windowHalf);
      const hi = Math.min(n - 1, i + windowHalf);
      const window = signal.slice(lo, hi + 1);

      const median = this.median(window);
      const deviations = window.map((v) => Math.abs(v - median));
      const mad = this.median(deviations) * HampelFilter.MAD_SCALE;

      const deviation = Math.abs(signal[i] - median);
      let isOutlier: boolean;
      if (mad > 0) {
        isOutlier = deviation > threshold * mad;
      } else {
        // MAD=0 (most neighbours identical): use mean absolute deviation as fallback
        const meanDev =
          deviations.reduce((a, b) => a + b, 0) / deviations.length;
        isOutlier = meanDev > 0 && deviation > threshold * meanDev;
      }

      result[i] = isOutlier ? median : signal[i];
    }

    return result;
  }

  /**
   * Detect outlier indices without replacing.
   */
  detectOutliers(
    signal: number[],
    windowHalf = 3,
    threshold = 3,
  ): number[] {
    const n = signal.length;
    const outliers: number[] = [];

    for (let i = 0; i < n; i++) {
      const lo = Math.max(0, i - windowHalf);
      const hi = Math.min(n - 1, i + windowHalf);
      const window = signal.slice(lo, hi + 1);

      const median = this.median(window);
      const deviations = window.map((v) => Math.abs(v - median));
      const mad = this.median(deviations) * HampelFilter.MAD_SCALE;

      const deviation = Math.abs(signal[i] - median);
      let isOutlier: boolean;
      if (mad > 0) {
        isOutlier = deviation > threshold * mad;
      } else {
        const meanDev =
          deviations.reduce((a, b) => a + b, 0) / deviations.length;
        isOutlier = meanDev > 0 && deviation > threshold * meanDev;
      }

      if (isOutlier) {
        outliers.push(i);
      }
    }

    return outliers;
  }

  private median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }
}
