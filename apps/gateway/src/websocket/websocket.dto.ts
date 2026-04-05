/** WebSocket event payloads sent to connected frontend clients */

export interface WsRealtimeMetrics {
  event: 'metrics';
  sessionId?: string;
  timestamp: number;
  estimatedCadence: number;
  stepIntervalEstimate: number;
  symmetryProxy: number;
  contactTimeProxy: number;
  flightTimeProxy: number;
  fatigueDriftScore: number;
  signalQualityScore: number;
  metricConfidence: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  validationStatus: 'unvalidated' | 'experimental' | 'station-validated' | 'externally-validated';
  speedKmh: number;
  inclinePercent: number;
}

export interface WsInferredMotionFrame {
  event: 'inferred-motion';
  sessionId?: string;
  timestamp: number;
  keypoints2D: Array<{ name: string; x: number; y: number; confidence: number }>;
  modelVersion: string;
  experimental: true;
  confidence: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  signalQualityScore: number;
  validationStatus: 'unvalidated' | 'experimental' | 'station-validated' | 'externally-validated';
  disclaimer: string;
}

export interface WsSessionEvent {
  event: 'session-event';
  sessionId: string;
  eventType: string;
  description: string;
  timestamp: number;
}

export interface WsConnectionAck {
  event: 'connection-ack';
  gatewayVersion: string;
  demoMode: boolean;
  timestamp: number;
}

export interface WsDemoState {
  event: 'demo-state';
  elapsedSeconds: number;
  currentGaitFreqHz: number;
  currentCadenceSpm: number;
  currentBreathingBpm: number;
  currentHeartRateBpm: number;
  fatigueLevel: number;
  signalNoiseLevel: string;
  packetsGenerated: number;
  treadmillSpeedKmh: number;
  treadmillInclinePercent: number;
  isRunning: boolean;
  profile: {
    name: string;
    restingCadenceSpm: number;
    maxCadenceSpm: number;
    asymmetryBaseline: number;
  };
  disclaimer: string;
}

export interface WsAutonomousState {
  event: 'autonomous-state';
  timestamp: number;
  coherence: {
    coherence: number;
    entropy: number;
    normalizedEntropy: number;
    isDecoherenceEvent: boolean;
    blochDrift: number;
  };
  gaitClassification: {
    winner: number;
    winnerProbability: number;
    isConverged: boolean;
  };
  ruleConclusions: Array<{
    ruleId: number;
    name: string;
    confidence: number;
    severity: 'info' | 'warning' | 'alert';
  }>;
  disclaimer: string;
}

export interface WsStationHealth {
  event: 'station-health';
  timestamp: number;
  activeStations: number;
  minCut: number;
  isHealing: boolean;
  weakestStation: string | null;
  coverageScore: number;
}

export interface WsRecordingStatus {
  event: 'recording-status';
  timestamp: number;
  isRecording: boolean;
  sessionId: string | null;
  framesRecorded: number;
  filesWritten: number;
}

export interface WsSignalDiagnostics {
  event: 'signal-diagnostics';
  timestamp: number;
  gateAcceptanceRate: number;
  fieldModel: {
    state: string;
    driftScore: number;
    motionEnergy: number;
    calibrationAge: number;
    presenceDetected: boolean;
  };
  pipelinePassRates: Record<string, number>;
  throughputHz: number;
  coherence: {
    coherence: number;
    normalizedEntropy: number;
    isDecoherenceEvent: boolean;
  };
  disclaimer: string;
}

export interface WsFieldModelState {
  event: 'field-model-state';
  timestamp: number;
  state: string;
  baselineAge: number;
  driftScore: number;
  motionEnergy: number;
  presenceDetected: boolean;
  disclaimer: string;
}
