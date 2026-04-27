import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { BackendClientService } from './backend-client.service';

/** How often to re-check calibration state from the backend. */
const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Caches the calibration state for this gateway's station.
 *
 * The backend is the source of truth — this service polls
 * {@code GET /calibrations/station/{stationId}/active} and maintains
 * a local boolean so the realtime metrics pipeline can query it
 * synchronously without a round-trip on every packet batch.
 */
@Injectable()
export class CalibrationStateService implements OnModuleInit {
  private readonly logger = new Logger(CalibrationStateService.name);

  private calibrated = false;
  private readonly stationId: string;

  constructor(private readonly backendClient: BackendClientService) {
    this.stationId = process.env.STATION_ID ?? '';
  }

  async onModuleInit(): Promise<void> {
    if (!this.stationId) {
      this.logger.warn(
        'STATION_ID env var is not set — calibration state will default to false',
      );
      return;
    }

    await this.refresh();
    setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
  }

  private async refresh(): Promise<void> {
    try {
      this.calibrated = await this.backendClient.getCalibrationActive(
        this.stationId,
      );
      this.logger.log(
        `Calibration refreshed for station ${this.stationId}: isCalibrated=${this.calibrated}`,
      );
    } catch (err) {
      this.logger.warn(
        `Could not refresh calibration state: ${(err as Error).message}` +
          ` — retaining previous value: ${this.calibrated}`,
      );
    }
  }

  /** Returns {@code true} when the station has an active, non-expired calibration. */
  getIsCalibrated(): boolean {
    return this.calibrated;
  }
}
