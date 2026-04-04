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
