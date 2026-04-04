import { Controller, Get } from '@nestjs/common';
import { SerialHealthIndicator } from '../serial/serial.health';
import { RealtimeMetricsService } from '../metrics/realtime-metrics.service';
import { SignalQualityService } from '../metrics/signal-quality.service';

const startTime = Date.now();

@Controller('health')
export class HealthController {
  constructor(
    private readonly serialHealth: SerialHealthIndicator,
    private readonly metrics: RealtimeMetricsService,
    private readonly signalQuality: SignalQualityService,
  ) {}

  @Get()
  check() {
    const serial = this.serialHealth.isHealthy();
    const latest = this.metrics.getLatest();

    return {
      status: serial ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.GATEWAY_VERSION ?? '0.1.0',
      uptimeMs: Date.now() - startTime,
      checks: {
        serial,
        demoMode: process.env.DEMO_MODE === 'true',
        sensingPipeline: !!latest,
        signalQuality: this.signalQuality.getSignalQualityScore(),
        packetRate: this.signalQuality.getPacketRate(),
      },
    };
  }
}
