import { Injectable } from '@nestjs/common';

/**
 * Estimates left-right asymmetry from alternating step intervals.
 * A proxy for symmetry — 0.0 = perfectly symmetric, 1.0 = maximally asymmetric.
 */
@Injectable()
export class AsymmetryProxy {
  private intervals: number[] = [];

  addInterval(intervalMs: number): void {
    this.intervals.push(intervalMs);
    if (this.intervals.length > 200) {
      this.intervals.shift();
    }
  }

  getSymmetryProxy(): number {
    if (this.intervals.length < 4) return 0;

    const recent = this.intervals.slice(-50);
    const odd = recent.filter((_, i) => i % 2 === 0);
    const even = recent.filter((_, i) => i % 2 === 1);

    const oddMean = odd.reduce((a, b) => a + b, 0) / odd.length;
    const evenMean = even.reduce((a, b) => a + b, 0) / even.length;
    const maxMean = Math.max(oddMean, evenMean);

    if (maxMean === 0) return 0;

    return Math.abs(oddMean - evenMean) / maxMean;
  }
}
