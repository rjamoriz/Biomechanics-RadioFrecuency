import { Injectable } from '@nestjs/common';
import { RingBuffer } from '../ingestion/ring-buffer';

/**
 * Estimates cadence (steps per minute) from rolling CSI amplitude variance.
 * Uses peak detection on amplitude variance across a sliding window.
 */
@Injectable()
export class CadenceEstimator {
  private readonly amplitudeHistory = new RingBuffer<number>(500);
  private lastEstimate = 0;

  update(amplitudeMean: number): void {
    this.amplitudeHistory.push(amplitudeMean);

    if (this.amplitudeHistory.size < 100) return;

    const values = this.amplitudeHistory.toArray();
    const peaks = this.countPeaks(values.slice(-300));
    const windowSeconds = (values.length / 100); // assuming ~100 Hz
    this.lastEstimate = (peaks / windowSeconds) * 60;
  }

  getEstimatedCadence(): number {
    return Math.round(this.lastEstimate * 10) / 10;
  }

  private countPeaks(values: number[]): number {
    let peaks = 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const threshold = mean * 1.1;

    for (let i = 1; i < values.length - 1; i++) {
      if (
        values[i] > threshold &&
        values[i] > values[i - 1] &&
        values[i] > values[i + 1]
      ) {
        peaks++;
      }
    }
    return peaks;
  }
}
