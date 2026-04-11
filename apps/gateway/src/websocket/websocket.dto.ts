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
  keypoints2D: Array<{ name: string; x: number; y: number; z?: number; confidence: number }>;
  modelVersion: string;
  experimental: true;
  confidence: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  signalQualityScore: number;
  validationStatus: 'unvalidated' | 'experimental' | 'station-validated' | 'externally-validated';
  disclaimer: string;
  estimatedForces?: {
    groundReactionForceN: number;
    brakingForceN: number;
    propulsiveForceN: number;
    impactLoadingRateNPerS: number;
    muscleForcesN: {
      quadricepsPeak: number;
      hamstringsPeak: number;
      gastrocnemiusPeak: number;
      gluteMaxPeak: number;
      tibialisAnteriorPeak: number;
    };
    runnerWeightN: number;
    speedKmh: number;
    disclaimer: string;
  };
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
  gateLastDecision?: {
    accepted: boolean;
    reason: string;
    score: number;
  };
  fieldModel?: {
    state: string;
    driftScore: number;
    motionEnergy: number;
    calibrationAge: number;
    presenceDetected: boolean;
  };
  fieldModelState?: string;
  fieldModelDriftScore?: number;
  fieldModelMotionEnergy?: number;
  fieldModelCalibrationAge?: number;
  pipelinePassRates: Record<string, number>;
  throughputHz: number;
  coherence?: {
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
  baselineAge?: number;
  calibrationAge?: number;
  driftScore: number;
  motionEnergy: number;
  presenceDetected: boolean;
  disclaimer?: string;
}

// ─── New RuView-Inspired Event DTOs ─────────────────────────────────

export interface WsAoAEstimate {
  event: 'aoa-estimate';
  timestamp: number;
  dominantAngleDeg: number;
  phaseSlope: number;
  pathLengthDelta: number;
  lateralDisplacement: number;
  confidence: number;
  aoaChangeRate: number;
  disclaimer: string;
}

export interface WsMultiChannelState {
  event: 'multi-channel-state';
  timestamp: number;
  channels: Array<{
    channel: number;
    signalQuality: number;
    packetRate: number;
    isActive: boolean;
  }>;
  bestChannel: number | null;
  diversityScore: number;
  isMultiChannel: boolean;
  totalPacketRate: number;
  disclaimer: string;
}

export interface WsFusedMetrics {
  event: 'fused-metrics';
  timestamp: number;
  estimatedCadence: number;
  stepIntervalEstimate: number;
  symmetryProxy: number;
  contactTimeProxy: number;
  flightTimeProxy: number;
  fatigueDriftScore: number;
  signalQualityScore: number;
  consensusConfidence: number;
  metricAgreement: Record<string, number>;
  stationWeights: Record<string, number>;
  stationCount: number;
  outlierStations: string[];
  disclaimer: string;
}

export interface WsAdaptiveClassification {
  event: 'adaptive-classification';
  timestamp: number;
  baselineEstablished: boolean;
  warmupProgress: number;
  overallAnomalyScore: number;
  deviations: Record<string, {
    zScore: number;
    percentile: number;
    isAnomaly: boolean;
    direction: 'above' | 'below' | 'normal';
  }>;
  sessionDrift: Record<string, number>;
  disclaimer: string;
}
