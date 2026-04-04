import { Injectable, Logger } from '@nestjs/common';
import { TreadmillState } from './treadmill.types';

/**
 * Manual input adapter — lets operators set treadmill speed/incline
 * via HTTP or WebSocket when no automatic integration exists.
 */
@Injectable()
export class ManualInputAdapter {
  private readonly logger = new Logger(ManualInputAdapter.name);
  private state: TreadmillState = {
    speedKph: 0,
    inclinePercent: 0,
    isRunning: false,
    source: 'manual',
    updatedAt: Date.now(),
  };

  update(speedKph: number, inclinePercent: number): TreadmillState {
    this.state = {
      speedKph,
      inclinePercent,
      isRunning: speedKph > 0,
      source: 'manual',
      updatedAt: Date.now(),
    };
    this.logger.log(`Manual update: ${speedKph} km/h, ${inclinePercent}% incline`);
    return this.state;
  }

  getCurrent(): TreadmillState {
    return { ...this.state };
  }
}
