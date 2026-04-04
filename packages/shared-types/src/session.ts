import { BaseEntity, SessionStatus, ValidationStatus } from './common';

export interface Session extends BaseEntity {
  athleteId: string;
  stationId: string;
  protocolTemplateId?: string;
  status: SessionStatus;
  startedAt?: string;
  endedAt?: string;
  speedKmh?: number;
  inclinePercent?: number;
  shoeType?: string;
  fatigueState?: string;
  notes?: string;
}

export interface CreateSessionRequest {
  athleteId: string;
  stationId: string;
  protocolTemplateId?: string;
  shoeType?: string;
  notes?: string;
}

export interface SessionStage extends BaseEntity {
  sessionId: string;
  stageIndex: number;
  label?: string;
  speedKmh: number;
  inclinePercent: number;
  durationSeconds?: number;
  startedAt?: string;
  endedAt?: string;
}

export interface SessionEvent extends BaseEntity {
  sessionId: string;
  eventType: string;
  payload?: Record<string, unknown>;
  occurredAt: string;
}

export interface ProtocolTemplate extends BaseEntity {
  name: string;
  description?: string;
  stages: ProtocolStage[];
}

export interface ProtocolStage {
  stageIndex: number;
  label?: string;
  speedKmh: number;
  inclinePercent: number;
  durationSeconds: number;
}

export interface CalibrationProfile extends BaseEntity {
  stationId: string;
  noiseFloorMean?: number;
  noiseFloorStd?: number;
  emptyBeltNoiseFloorMean?: number;
  emptyBeltNoiseFloorStd?: number;
  signalQualityScore?: number;
  validationStatus: ValidationStatus;
  notes?: string;
}
