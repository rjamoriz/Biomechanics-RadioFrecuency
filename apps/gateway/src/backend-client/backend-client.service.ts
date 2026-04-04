import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class BackendClientService implements OnModuleInit {
  private readonly logger = new Logger(BackendClientService.name);
  private client!: AxiosInstance;

  onModuleInit() {
    const baseURL =
      process.env.BACKEND_URL ?? 'http://localhost:8080/api';

    this.client = axios.create({
      baseURL,
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.logger.log(`Backend client configured → ${baseURL}`);
  }

  async postMetric(payload: {
    sessionId: string;
    timestamp: number;
    metricName: string;
    value: number;
    confidence: number;
    signalQuality: number;
    modelVersion?: string;
  }) {
    try {
      await this.client.post('/ingestion/metrics', payload);
    } catch (err) {
      this.logger.warn(
        `Failed to post metric ${payload.metricName}: ${(err as Error).message}`,
      );
    }
  }

  async postSessionEvent(
    sessionId: string,
    eventType: string,
    description: string,
  ) {
    try {
      await this.client.post(`/sessions/${sessionId}/events`, {
        eventType,
        description,
        occurredAt: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.warn(
        `Failed to post session event: ${(err as Error).message}`,
      );
    }
  }

  async getSession(sessionId: string) {
    const { data } = await this.client.get(`/sessions/${sessionId}`);
    return data;
  }

  async getStationCalibration(stationId: string) {
    const { data } = await this.client.get(
      `/calibrations?stationId=${encodeURIComponent(stationId)}`,
    );
    return data;
  }
}
