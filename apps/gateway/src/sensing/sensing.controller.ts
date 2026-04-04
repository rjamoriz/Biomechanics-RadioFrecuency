import { Controller, Get } from '@nestjs/common';
import { RealtimeMetricsService } from '../metrics/realtime-metrics.service';
import { VitalSignsService } from '../vital-signs/vital-signs.service';
import { SignalQualityService } from '../metrics/signal-quality.service';

/**
 * REST API for sensing data access.
 *
 * Provides HTTP endpoints for polling-style access to the latest
 * sensing state — complementary to the WebSocket stream.
 *
 * Matches RuView's /api/v1/sensing/* surface.
 */
@Controller('api/v1/sensing')
export class SensingController {
  constructor(
    private readonly metrics: RealtimeMetricsService,
    private readonly vitalSigns: VitalSignsService,
    private readonly signalQuality: SignalQualityService,
  ) {}

  /**
   * GET /api/v1/sensing/latest
   * Returns the latest realtime metrics snapshot.
   */
  @Get('latest')
  getLatest() {
    const latest = this.metrics.getLatest();
    if (!latest) {
      return {
        status: 'no_data',
        message: 'No CSI data has been processed yet.',
        timestamp: Date.now(),
      };
    }

    return {
      status: 'ok',
      timestamp: Date.now(),
      metrics: latest,
    };
  }

  /**
   * GET /api/v1/sensing/vital-signs
   * Returns estimated breathing rate and heart rate.
   */
  @Get('vital-signs')
  getVitalSigns() {
    const vitals = this.vitalSigns.getVitalSigns();

    return {
      status: 'ok',
      timestamp: Date.now(),
      vitalSigns: vitals,
      disclaimer:
        'These are estimated proxy metrics derived from Wi-Fi CSI phase analysis. ' +
        'They are NOT clinical-grade vital sign measurements.',
    };
  }

  /**
   * GET /api/v1/sensing/signal-quality
   * Returns current signal quality details.
   */
  @Get('signal-quality')
  getSignalQuality() {
    return {
      status: 'ok',
      timestamp: Date.now(),
      signalQuality: {
        score: this.signalQuality.getSignalQualityScore(),
        packetRate: this.signalQuality.getPacketRate(),
      },
    };
  }

  /**
   * GET /api/v1/sensing/status
   * Overall sensing pipeline status.
   */
  @Get('status')
  getStatus() {
    const latest = this.metrics.getLatest();
    const vitals = this.vitalSigns.getVitalSigns();

    return {
      status: 'ok',
      timestamp: Date.now(),
      pipeline: {
        metricsActive: !!latest,
        vitalSignsBufferFill: vitals.bufferFill,
        signalQualityScore: this.signalQuality.getSignalQualityScore(),
        packetRate: this.signalQuality.getPacketRate(),
        lastMetricTimestamp: latest?.timestamp ?? null,
      },
    };
  }
}
