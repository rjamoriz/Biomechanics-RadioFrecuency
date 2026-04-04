import { Injectable } from '@nestjs/common';

/**
 * Aggregates per-metric confidence into overall model confidence.
 * Factors: signal quality, calibration status, packet rate, metric stability.
 */
@Injectable()
export class ConfidenceService {
  computeConfidence(params: {
    signalQuality: number;
    packetRate: number;
    isCalibrated: boolean;
    metricStability: number;
  }): number {
    const { signalQuality, packetRate, isCalibrated, metricStability } = params;

    const rateScore = Math.min(1, packetRate / 100);
    const calibrationBonus = isCalibrated ? 0.15 : 0;

    const raw =
      signalQuality * 0.35 +
      rateScore * 0.25 +
      metricStability * 0.25 +
      calibrationBonus;

    return Math.round(Math.min(1, Math.max(0, raw)) * 100) / 100;
  }
}
