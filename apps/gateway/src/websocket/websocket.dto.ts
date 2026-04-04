/** WebSocket event payloads sent to connected frontend clients */

export interface WsRealtimeMetrics {
  event: 'metrics';
  sessionId?: string;
  timestamp: number;
  estimatedCadenceSpm: number;
  stepIntervalMs: number;
  symmetryProxy: number;
  contactTimeProxy: number;
  flightTimeProxy: number;
  fatigueDriftScore: number;
  signalQualityScore: number;
  metricConfidence: number;
  treadmillSpeedKph: number;
  treadmillInclinePercent: number;
}

export interface WsInferredMotionFrame {
  event: 'inferred-motion';
  sessionId?: string;
  timestamp: number;
  keypoints2d: Array<{ name: string; x: number; y: number; confidence: number }>;
  modelVersion: string;
  experimental: true;
  frameConfidence: number;
  signalQuality: number;
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
