'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  LiveInjuryRiskSnapshot,
  InjuryRiskSummary,
  InjuryRiskLevel,
} from '@/types/injury-risk';

const GATEWAY_URL =
  process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:3001';

// ─── Session history from backend ────────────────────────────────────

export function useInjuryRiskHistory(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['injury-risk', sessionId],
    queryFn: () =>
      apiFetch<InjuryRiskSummary[]>(`/injury-risk/session/${sessionId}`),
    enabled: !!sessionId,
    staleTime: 30_000,
  });
}

export function useWorstInjuryRisk(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['injury-risk', sessionId, 'worst'],
    queryFn: () =>
      apiFetch<InjuryRiskSummary>(`/injury-risk/session/${sessionId}/worst`),
    enabled: !!sessionId,
    staleTime: 30_000,
  });
}

// ─── Live streaming from gateway ─────────────────────────────────────

export interface UseInjuryRiskLiveOptions {
  sessionId?: string;
  /** Max history snapshots to keep in memory. Default: 300 */
  historySize?: number;
}

export interface InjuryRiskLiveState {
  latest: LiveInjuryRiskSnapshot | null;
  history: LiveInjuryRiskSnapshot[];
  isConnected: boolean;
  error: string | null;
}

export function useInjuryRiskLive({
  sessionId,
  historySize = 300,
}: UseInjuryRiskLiveOptions): InjuryRiskLiveState {
  const socketRef = useRef<Socket | null>(null);
  const [latest, setLatest] = useState<LiveInjuryRiskSnapshot | null>(null);
  const [history, setHistory] = useState<LiveInjuryRiskSnapshot[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = io(`${GATEWAY_URL}/live`, {
      transports: ['websocket'],
      reconnectionAttempts: 8,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('connect_error', (err) => setError(err.message));

    socket.on('injury-risk', (data: LiveInjuryRiskSnapshot) => {
      setLatest(data);
      setHistory((prev) => {
        const next = [...prev, data];
        return next.length > historySize ? next.slice(-historySize) : next;
      });
    });

    return () => {
      socket.disconnect();
    };
  }, [historySize]);

  return { latest, history, isConnected, error };
}

// ─── Risk trend data for Recharts ─────────────────────────────────────

export interface RiskTrendPoint {
  timestamp: number;
  overallRiskScore: number;
  riskLevel: InjuryRiskLevel;
  knee_left?: number;
  knee_right?: number;
  hip_left?: number;
  hip_right?: number;
  ankle_left?: number;
  ankle_right?: number;
  lumbar?: number;
}

export function buildRiskTrend(
  history: LiveInjuryRiskSnapshot[],
): RiskTrendPoint[] {
  return history.map((s) => {
    const artMap = Object.fromEntries(
      s.articulationRisks.map((a) => [a.joint, a.riskScore]),
    ) as Record<string, number>;

    return {
      timestamp: s.timestamp,
      overallRiskScore: s.overallRiskScore,
      riskLevel: s.overallRiskLevel,
      knee_left:  artMap['knee_left'],
      knee_right: artMap['knee_right'],
      hip_left:   artMap['hip_left'],
      hip_right:  artMap['hip_right'],
      ankle_left: artMap['ankle_left'],
      ankle_right: artMap['ankle_right'],
      lumbar:     artMap['lumbar'],
    };
  });
}
