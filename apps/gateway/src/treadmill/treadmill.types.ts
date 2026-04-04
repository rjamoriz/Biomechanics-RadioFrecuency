/** Current treadmill state — speed and incline that affects metric interpretation */
export interface TreadmillState {
  speedKph: number;
  inclinePercent: number;
  isRunning: boolean;
  source: 'manual' | 'protocol' | 'integration';
  updatedAt: number;
}

/** Protocol stage definition mirroring the backend model */
export interface ProtocolStageConfig {
  orderIndex: number;
  label: string;
  durationSeconds: number;
  speedKph: number;
  inclinePercent: number;
}

/** Active protocol run state */
export interface ProtocolRunState {
  protocolName: string;
  stages: ProtocolStageConfig[];
  currentStageIndex: number;
  stageStartedAt: number;
  isActive: boolean;
}
