import { Injectable } from '@nestjs/common';

/**
 * Estimates ground contact time proxy from CSI amplitude patterns.
 * Uses the ratio of time the signal is above a threshold vs below.
 */
@Injectable()
export class ContactTimeProxy {
  private samples: { amplitude: number; timestamp: number }[] = [];
  private lastEstimateMs = 0;

  addSample(amplitude: number, timestamp: number): void {
    this.samples.push({ amplitude, timestamp });
    if (this.samples.length > 500) {
      this.samples.shift();
    }
  }

  getContactTimeProxyMs(): number {
    if (this.samples.length < 100) return 0;

    const recent = this.samples.slice(-200);
    const amplitudes = recent.map((s) => s.amplitude);
    const mean = amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length;

    const aboveCount = amplitudes.filter((a) => a > mean).length;
    const ratio = aboveCount / amplitudes.length;

    // Rough heuristic: contact time ≈ ratio * average step interval
    const totalTimeMs =
      recent[recent.length - 1].timestamp - recent[0].timestamp;
    this.lastEstimateMs = ratio * (totalTimeMs / (recent.length / 100)) * 0.5;

    return Math.round(this.lastEstimateMs);
  }
}
