'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const GATEWAY_URL =
  process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:3001';

export interface RealtimeMetrics {
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
  validationStatus: string;
  speedKmh: number;
  inclinePercent: number;
}

export interface InferredMotionFrame {
  timestamp: number;
  keypoints2D: Array<{ name: string; x: number; y: number; z?: number; confidence: number }>;
  modelVersion: string;
  experimental: boolean;
  confidence: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  signalQualityScore: number;
  validationStatus: string;
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

// ─────────────────────────────────────────────────────────────────────────────
// Joint Kinematics — proxy per-joint estimates during running
// ─────────────────────────────────────────────────────────────────────────────

export type RunningGaitPhase =
  | 'loading_response'
  | 'mid_stance'
  | 'terminal_stance'
  | 'toe_off'
  | 'initial_swing'
  | 'mid_swing'
  | 'terminal_swing';

export interface JointProxyData {
  angleProxyDeg: number;
  forceProxyN: number;
  displacementFromBaselineDeg: number;
  riskLevel: 'normal' | 'elevated' | 'high';
  confidence: number;
}

export interface JointKinematicsFrame {
  timestamp: number;
  leftLegPhase: RunningGaitPhase;
  rightLegPhase: RunningGaitPhase;
  gaitCyclePositionLeft: number;
  gaitCyclePositionRight: number;
  joints: {
    leftKnee: JointProxyData;
    rightKnee: JointProxyData;
    leftHip: JointProxyData;
    rightHip: JointProxyData;
    leftAnkle: JointProxyData;
    rightAnkle: JointProxyData;
    lowerBack: JointProxyData;
  };
  bilateralSymmetryScore: number;
  highestRiskJoint: string;
  speedKmh: number;
  inclinePercent: number;
  experimental: true;
  validationStatus: 'experimental';
  disclaimer: string;
}

export interface VitalEstimate {
  estimatedBpm: number;
  confidence: number;
  subcarriersUsed: number;
  label: string;
  validationStatus: string;
}

export interface VitalSignsData {
  timestamp: number;
  breathing: VitalEstimate | null;
  heartRate: VitalEstimate | null;
  bufferFill: number;
  disclaimer: string;
}

export interface SignalDiagnosticsData {
  timestamp: number;
  throughputHz: number;
  gateAcceptanceRate: number;
  fieldModel?: {
    presenceDetected: boolean;
    motionEnergy: number;
    driftScore: number;
    state: string;
  };
  coherence?: {
    coherence: number;
    normalizedEntropy: number;
    isDecoherenceEvent: boolean;
  };
  disclaimer: string;
}

export interface SimulationState {
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
  heightCm: number;
  weightKg: number;
  profile: {
    name: string;
    restingCadenceSpm: number;
    maxCadenceSpm: number;
    asymmetryBaseline: number;
  };
}

export type DemoControlAction =
  | 'set-profile'
  | 'set-fatigue'
  | 'set-noise'
  | 'reset'
  | 'start-protocol'
  | 'set-anthropometrics';

export function useGatewaySocket() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [metrics, setMetrics] = useState<RealtimeMetrics | null>(null);
  const [inferredFrame, setInferredFrame] = useState<InferredMotionFrame | null>(null);
  const [vitalSigns, setVitalSigns] = useState<VitalSignsData | null>(null);
  const [demoState, setDemoState] = useState<SimulationState | null>(null);
  const [jointKinematics, setJointKinematics] = useState<JointKinematicsFrame | null>(null);
  const [signalDiagnostics, setSignalDiagnostics] = useState<SignalDiagnosticsData | null>(null);

  useEffect(() => {
    const socket = io(`${GATEWAY_URL}/live`, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('connection-ack', (data: { demoMode: boolean }) => {
      setDemoMode(data.demoMode);
    });

    socket.on('metrics', (data: RealtimeMetrics) => {
      setMetrics(data);
    });

    socket.on('inferred-motion', (data: InferredMotionFrame) => {
      setInferredFrame(data);
    });

    socket.on('vital-signs', (data: VitalSignsData) => {
      setVitalSigns(data);
    });

    socket.on('demo-state', (data: SimulationState) => {
      setDemoState(data);
    });

    socket.on('joint-kinematics', (data: JointKinematicsFrame) => {
      setJointKinematics(data);
    });

    socket.on('signal-diagnostics', (data: SignalDiagnosticsData) => {
      setSignalDiagnostics(data);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const setTreadmill = useCallback(
    (speedKph: number, inclinePercent: number) => {
      socketRef.current?.emit('set-treadmill', { speedKph, inclinePercent });
    },
    [],
  );

  const sendDemoControl = useCallback(
    (action: DemoControlAction, payload?: Record<string, unknown>) => {
      socketRef.current?.emit('demo-control', { action, payload });
    },
    [],
  );

  return {
    connected,
    demoMode,
    metrics,
    inferredFrame,
    vitalSigns,
    demoState,
    jointKinematics,
    signalDiagnostics,
    setTreadmill,
    sendDemoControl,
  };
}
