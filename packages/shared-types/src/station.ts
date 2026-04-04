import { BaseEntity, CalibrationStatus } from './common';

export interface Station extends BaseEntity {
  name: string;
  location: string;
  txMac?: string;
  rxMac?: string;
  txPlacementX?: number;
  txPlacementY?: number;
  txPlacementZ?: number;
  rxPlacementX?: number;
  rxPlacementY?: number;
  rxPlacementZ?: number;
  separationCm?: number;
  calibrationStatus: CalibrationStatus;
  active: boolean;
  notes?: string;
}

export interface CreateStationRequest {
  name: string;
  location: string;
  txMac?: string;
  rxMac?: string;
  txPlacementX?: number;
  txPlacementY?: number;
  txPlacementZ?: number;
  rxPlacementX?: number;
  rxPlacementY?: number;
  rxPlacementZ?: number;
  separationCm?: number;
  notes?: string;
}

export interface Treadmill extends BaseEntity {
  stationId: string;
  brand?: string;
  model?: string;
  maxSpeedKmh?: number;
  maxInclinePercent?: number;
}
