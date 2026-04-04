import { Injectable } from '@nestjs/common';

/**
 * Tracks metric stability over time to detect fatigue-related drift.
 * Monitors variance increase in cadence and contact-time proxy.
 */
@Injectable()
export class FatigueDrift {
  private cadenceHistory: number[] = [];
  private contactTimeHistory: number[] = [];

  addCadence(value: number): void {
    this.cadenceHistory.push(value);
    if (this.cadenceHistory.length > 600) this.cadenceHistory.shift();
  }

  addContactTime(value: number): void {
    this.contactTimeHistory.push(value);
    if (this.contactTimeHistory.length > 600) this.contactTimeHistory.shift();
  }

  getFatigueDriftScore(): number {
    if (this.cadenceHistory.length < 60) return 0;

    const earlyVar = this.variance(this.cadenceHistory.slice(0, 30));
    const recentVar = this.variance(this.cadenceHistory.slice(-30));

    if (earlyVar === 0) return 0;
    const drift = Math.max(0, (recentVar - earlyVar) / earlyVar);
    return Math.min(1, drift);
  }

  private variance(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  }
}
