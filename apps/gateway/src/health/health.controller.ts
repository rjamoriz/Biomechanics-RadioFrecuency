import { Controller, Get } from '@nestjs/common';
import { SerialHealthIndicator } from '../serial/serial.health';

@Controller('health')
export class HealthController {
  constructor(private readonly serialHealth: SerialHealthIndicator) {}

  @Get()
  check() {
    const serial = this.serialHealth.isHealthy();
    return {
      status: serial ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        serial,
        demoMode: process.env.DEMO_MODE === 'true',
      },
    };
  }
}
