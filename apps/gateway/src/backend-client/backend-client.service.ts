import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { InferredMotionFrame } from '../pose/pose.types';

export function normalizeBackendApiUrl(rawUrl?: string): string {
  const baseUrl = (rawUrl?.trim() || 'http://localhost:8080').replace(/\/+$/, '');
  return baseUrl.endsWith('/api') ? baseUrl : `${baseUrl}/api`;
}

export interface MetricIngestionPayload {
  sessionId: string;
  timestamp: number | string;
  metricName: string;
  value: number;
  confidence: number;
  signalQuality: number;
  modelVersion?: string;
}

export interface InjuryRiskSummaryPayload {
  peakRiskScore: number;
  peakRiskLevel: 'low' | 'moderate' | 'elevated' | 'high' | 'critical';
  meanRiskScore: number;
  peakRiskTimestamp: number;
  articulationPeaksJson: string;
  dominantRiskFactors: string;
  snapshotCount: number;
  modelConfidence: number;
  signalQualityScore: number;
}

@Injectable()
export class BackendClientService implements OnModuleInit {
  private readonly logger = new Logger(BackendClientService.name);
  private client!: AxiosInstance;

  onModuleInit() {
    const baseURL = normalizeBackendApiUrl(process.env.BACKEND_URL);

    this.client = axios.create({
      baseURL,
      timeout: 5000,
      headers: { 'Content-Type': 'application/json' },
    });

    this.logger.log(`Backend client configured → ${baseURL}`);
  }

  async postMetric(payload: MetricIngestionPayload) {
    await this.postMetrics([payload]);
  }

  async postMetrics(payloads: MetricIngestionPayload[]) {
    const normalized = payloads.map((payload) => ({
      ...payload,
      timestamp:
        typeof payload.timestamp === 'number'
          ? new Date(payload.timestamp).toISOString()
          : payload.timestamp,
    }));

    try {
      await this.client.post('/ingestion/metrics', normalized);
    } catch (err) {
      this.logger.warn(
        `Failed to post ${payloads.length} metric payload(s): ${(err as Error).message}`,
      );
    }
  }

  async postInferredMotionSeries(
    sessionId: string,
    frames: InferredMotionFrame[],
  ) {
    if (frames.length === 0) {
      return;
    }

    const meanConfidence =
      frames.reduce((sum, frame) => sum + frame.confidence, 0) / frames.length;
    const signalQualitySummary =
      frames.reduce((sum, frame) => sum + frame.signalQualityScore, 0) / frames.length;

    try {
      await this.client.post(`/inferred-motion/session/${encodeURIComponent(sessionId)}`, {
        modelVersion: frames[0].modelVersion,
        inferenceMode: 'wifi_csi_inferred_motion',
        keypointSchemaVersion: 'biomech-keypoints-v1',
        frames,
        meanConfidence,
        signalQualitySummary,
        validationStatus: 'experimental',
      });
    } catch (err) {
      this.logger.warn(
        `Failed to post inferred motion series for session ${sessionId}: ${(err as Error).message}`,
      );
    }
  }

  async postInjuryRiskSummary(
    sessionId: string,
    summary: InjuryRiskSummaryPayload,
  ) {
    try {
      await this.client.post(
        `/injury-risk/session/${encodeURIComponent(sessionId)}`,
        summary,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to post injury risk summary for session ${sessionId}: ${(err as Error).message}`,
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

  /**
   * Returns {@code true} when the station has an active, non-expired calibration.
   * Calls {@code GET /calibrations/station/{stationId}/active} which is public.
   */
  async getCalibrationActive(stationId: string): Promise<boolean> {
    try {
      const { data } = await this.client.get<boolean>(
        `/calibrations/station/${encodeURIComponent(stationId)}/active`,
      );
      return data === true;
    } catch (err) {
      this.logger.warn(
        `Failed to fetch calibration state for station ${stationId}: ${(err as Error).message}`,
      );
      return false;
    }
  }
}
