import { RealtimeMetrics } from './metrics';
import { InferredMotionFrame } from './inferred-motion';

/* ──────────────────────────────────────────────
 * WebSocket event contracts for the /live namespace.
 * ────────────────────────────────────────────── */

/** Server → Client: realtime metric snapshot. */
export interface WsRealtimeMetrics extends RealtimeMetrics {}

/** Server → Client: inferred motion frame. */
export interface WsInferredMotionFrame extends InferredMotionFrame {
  sessionId: string;
}

/** Server → Client: session lifecycle event. */
export interface WsSessionEvent {
  sessionId: string;
  eventType: string;
  payload?: Record<string, unknown>;
  occurredAt: string;
}

/** Server → Client: initial connection acknowledgement. */
export interface WsConnectionAck {
  status: 'connected';
  demoMode: boolean;
  serverTime: number;
}

/** Client → Server: set treadmill speed and incline. */
export interface WsSetTreadmill {
  speedKmh: number;
  inclinePercent: number;
}

/** Client → Server: start protocol execution. */
export interface WsStartProtocol {
  stages: WsProtocolStageConfig[];
}

export interface WsProtocolStageConfig {
  label?: string;
  speedKmh: number;
  inclinePercent: number;
  durationSeconds: number;
}
