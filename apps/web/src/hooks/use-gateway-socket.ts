'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const GATEWAY_URL =
  process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:3001';

export interface RealtimeMetrics {
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

export interface InferredMotionFrame {
  timestamp: number;
  keypoints2d: Array<{ name: string; x: number; y: number; confidence: number }>;
  modelVersion: string;
  experimental: boolean;
  frameConfidence: number;
  signalQuality: number;
  disclaimer: string;
}

export function useGatewaySocket() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [metrics, setMetrics] = useState<RealtimeMetrics | null>(null);
  const [inferredFrame, setInferredFrame] = useState<InferredMotionFrame | null>(null);

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

  return { connected, demoMode, metrics, inferredFrame, setTreadmill };
}
