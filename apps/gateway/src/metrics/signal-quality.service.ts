import { Injectable } from '@nestjs/common';

/**
 * Computes a signal quality score (0..1) from packet rate and RSSI stability.
 */
@Injectable()
export class SignalQualityService {
  private rssiHistory: number[] = [];
  private packetTimestamps: number[] = [];

  addPacket(rssi: number): void {
    const now = Date.now();
    this.rssiHistory.push(rssi);
    this.packetTimestamps.push(now);

    if (this.rssiHistory.length > 200) this.rssiHistory.shift();
    if (this.packetTimestamps.length > 200) this.packetTimestamps.shift();
  }

  getSignalQualityScore(): number {
    if (this.packetTimestamps.length < 10) return 0;

    const packetRateScore = this.packetRateScore();
    const rssiStabilityScore = this.rssiStabilityScore();

    return Math.round((packetRateScore * 0.5 + rssiStabilityScore * 0.5) * 100) / 100;
  }

  getPacketRate(): number {
    if (this.packetTimestamps.length < 2) return 0;
    const windowMs =
      this.packetTimestamps[this.packetTimestamps.length - 1] -
      this.packetTimestamps[0];
    if (windowMs === 0) return 0;
    return (this.packetTimestamps.length / windowMs) * 1000;
  }

  private packetRateScore(): number {
    const rate = this.getPacketRate();
    const targetRate = 100; // ~100 Hz expected
    return Math.min(1, rate / targetRate);
  }

  private rssiStabilityScore(): number {
    if (this.rssiHistory.length < 5) return 0;
    const recent = this.rssiHistory.slice(-50);
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    const variance =
      recent.reduce((sum, v) => sum + (v - mean) ** 2, 0) / recent.length;
    const stddev = Math.sqrt(variance);
    // Lower variance = better quality
    return Math.max(0, 1 - stddev / 20);
  }
}
