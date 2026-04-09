'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfidenceIndicator } from '@/components/ui/confidence-indicator';
import { apiFetch } from '@/lib/api';
import { useStations } from '@/hooks/use-stations';
import {
  Activity,
  Radio,
  AlertTriangle,
  BarChart3,
  Loader2,
  Info,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────

interface SubcarrierSnapshot {
  timestamp: string;
  amplitudes: number[];
}

interface NoiseFloorPoint {
  timestamp: string;
  noiseFloorDbm: number;
}

interface InterferenceAlert {
  id: string;
  timestamp: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  affectedSubcarriers: number[];
}

interface BaselineComparison {
  calibratedNoiseFloor: number;
  currentNoiseFloor: number;
  calibratedSignalQuality: number;
  currentSignalQuality: number;
  calibratedAt: string;
  driftPercent: number;
}

interface SignalAnalyticsData {
  stationId: string;
  subcarrierHeatmap: SubcarrierSnapshot[];
  noiseFloorTimeline: NoiseFloorPoint[];
  interferenceAlerts: InterferenceAlert[];
  baselineComparison: BaselineComparison | null;
  overallSignalQuality: number;
}

type TimeWindow = 10 | 30 | 60;

const SEVERITY_COLORS: Record<string, string> = {
  low: 'bg-yellow-100 text-yellow-800',
  medium: 'bg-orange-100 text-orange-800',
  high: 'bg-red-100 text-red-800',
};

function amplitudeToColor(value: number, min: number, max: number): string {
  const ratio = max === min ? 0.5 : (value - min) / (max - min);
  const clamped = Math.max(0, Math.min(1, ratio));
  const r = Math.round(clamped * 239);
  const b = Math.round((1 - clamped) * 239);
  return `rgb(${r}, 68, ${b})`;
}

// ── Main Component ──────────────────────────────────────────────

export default function SignalAnalyticsPage() {
  const [selectedStationId, setSelectedStationId] = useState<string>('');
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(30);

  const { data: stations, isLoading: stationsLoading } = useStations();

  const {
    data: analytics,
    isLoading: analyticsLoading,
    error: analyticsError,
  } = useQuery({
    queryKey: ['signal-analytics', selectedStationId, timeWindow],
    queryFn: () =>
      apiFetch<SignalAnalyticsData>(
        `/stations/${encodeURIComponent(selectedStationId)}/signal-analytics?window=${timeWindow}`,
      ),
    enabled: !!selectedStationId,
  });

  const heatmapGlobal = (() => {
    if (!analytics?.subcarrierHeatmap?.length) return { min: 0, max: 1 };
    let min = Infinity;
    let max = -Infinity;
    for (const row of analytics.subcarrierHeatmap) {
      for (const v of row.amplitudes) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    return { min, max };
  })();

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Signal Analytics</h1>

      {/* Sensing disclaimer */}
      <div
        className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800"
        data-testid="sensing-disclaimer"
      >
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Signal analytics are derived from Wi-Fi CSI. These are RF
          measurements, not optical data.
        </p>
      </div>

      {/* Station selector */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5" />
            Station
          </CardTitle>
        </CardHeader>
        <div className="px-6 pb-4">
          <select
            value={selectedStationId}
            onChange={(e) => setSelectedStationId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            data-testid="station-selector"
          >
            <option value="">Select a station…</option>
            {stations?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.location}
              </option>
            ))}
          </select>

          {stationsLoading && (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading stations…
            </div>
          )}
        </div>
      </Card>

      {/* Loading / error / empty states */}
      {selectedStationId && analyticsLoading && (
        <div className="py-12 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400" />
          <p className="mt-2 text-sm text-slate-500">
            Loading signal analytics…
          </p>
        </div>
      )}

      {selectedStationId && analyticsError && (
        <Card>
          <div className="p-6 text-center text-sm text-red-600">
            <AlertTriangle className="mx-auto mb-2 h-6 w-6" />
            Failed to load signal analytics. Please try again.
          </div>
        </Card>
      )}

      {!selectedStationId && (
        <Card>
          <div className="p-8 text-center text-sm text-slate-500">
            Select a station to view signal analytics.
          </div>
        </Card>
      )}

      {/* Analytics content */}
      {analytics && (
        <div className="space-y-6">
          {/* Overall signal quality */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Signal Quality Overview
              </CardTitle>
            </CardHeader>
            <div className="px-6 pb-4">
              <ConfidenceIndicator
                value={analytics.overallSignalQuality}
                label="Overall Signal Quality"
              />
            </div>
          </Card>

          {/* Subcarrier heatmap */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Subcarrier Heatmap
                </CardTitle>
                <div
                  className="flex gap-1"
                  data-testid="time-window-controls"
                >
                  {([10, 30, 60] as TimeWindow[]).map((w) => (
                    <button
                      key={w}
                      onClick={() => setTimeWindow(w)}
                      data-testid={`window-${w}s`}
                      className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                        timeWindow === w
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {w}s
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <div className="px-6 pb-4">
              {analytics.subcarrierHeatmap.length > 0 ? (
                <div
                  data-testid="heatmap-grid"
                  className="overflow-x-auto"
                >
                  <div
                    className="grid gap-px"
                    style={{
                      gridTemplateColumns: `auto repeat(${analytics.subcarrierHeatmap[0].amplitudes.length}, minmax(4px, 1fr))`,
                    }}
                  >
                    {/* Header row */}
                    <div className="text-[10px] text-slate-400" />
                    {analytics.subcarrierHeatmap[0].amplitudes.map(
                      (_, ci) => (
                        <div
                          key={ci}
                          className="text-center text-[10px] text-slate-400"
                        >
                          {ci}
                        </div>
                      ),
                    )}

                    {/* Data rows */}
                    {analytics.subcarrierHeatmap.map((row, ri) => (
                      <React.Fragment key={`row-${ri}`}>
                        <div
                          className="pr-1 text-right text-[10px] text-slate-500"
                        >
                          {new Date(row.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </div>
                        {row.amplitudes.map((amp, ci) => (
                          <div
                            key={`${ri}-${ci}`}
                            className="h-3 rounded-sm"
                            style={{
                              backgroundColor: amplitudeToColor(
                                amp,
                                heatmapGlobal.min,
                                heatmapGlobal.max,
                              ),
                            }}
                            title={`SC ${ci}: ${amp.toFixed(1)} dB`}
                          />
                        ))}
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Color legend */}
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
                    <span>Low</span>
                    <div className="h-2 w-24 rounded bg-gradient-to-r from-blue-600 via-purple-500 to-red-500" />
                    <span>High</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">
                  No heatmap data available for this window.
                </p>
              )}
            </div>
          </Card>

          {/* Noise floor timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Noise Floor Timeline</CardTitle>
            </CardHeader>
            <div className="px-6 pb-4" data-testid="noise-chart">
              {analytics.noiseFloorTimeline.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={analytics.noiseFloorTimeline}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="timestamp"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: string) =>
                        new Date(v).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      }
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      label={{
                        value: 'dBm',
                        angle: -90,
                        position: 'insideLeft',
                        style: { fontSize: 11 },
                      }}
                    />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="noiseFloorDbm"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={false}
                      name="Noise Floor"
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-slate-500">
                  No noise floor data available.
                </p>
              )}
            </div>
          </Card>

          {/* Interference alerts */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Interference Alerts
              </CardTitle>
            </CardHeader>
            <div className="px-6 pb-4">
              {analytics.interferenceAlerts.length > 0 ? (
                <ul className="space-y-2">
                  {analytics.interferenceAlerts.map((alert) => (
                    <li
                      key={alert.id}
                      className="flex items-start gap-3 rounded-lg border border-slate-200 p-3"
                    >
                      <Badge className={SEVERITY_COLORS[alert.severity]}>
                        {alert.severity}
                      </Badge>
                      <div className="flex-1">
                        <p className="text-sm text-slate-800">
                          {alert.message}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {new Date(alert.timestamp).toLocaleString()} —
                          Subcarriers: {alert.affectedSubcarriers.join(', ')}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">
                  No interference alerts detected.
                </p>
              )}
            </div>
          </Card>

          {/* Baseline comparison */}
          {analytics.baselineComparison && (
            <Card>
              <CardHeader>
                <CardTitle>Baseline Comparison</CardTitle>
              </CardHeader>
              <div className="px-6 pb-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">
                      Calibrated Noise Floor
                    </p>
                    <p className="text-lg font-semibold text-slate-900">
                      {analytics.baselineComparison.calibratedNoiseFloor} dBm
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">
                      Current Noise Floor
                    </p>
                    <p className="text-lg font-semibold text-slate-900">
                      {analytics.baselineComparison.currentNoiseFloor} dBm
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <ConfidenceIndicator
                      value={
                        analytics.baselineComparison.calibratedSignalQuality
                      }
                      label="Calibrated Signal Quality"
                    />
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <ConfidenceIndicator
                      value={
                        analytics.baselineComparison.currentSignalQuality
                      }
                      label="Current Signal Quality"
                    />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm">
                  <span className="text-slate-500">Drift:</span>
                  <Badge
                    className={
                      Math.abs(
                        analytics.baselineComparison.driftPercent,
                      ) > 10
                        ? 'bg-red-100 text-red-800'
                        : 'bg-green-100 text-green-800'
                    }
                  >
                    {analytics.baselineComparison.driftPercent > 0 ? '+' : ''}
                    {analytics.baselineComparison.driftPercent.toFixed(1)}%
                  </Badge>
                  <span className="text-xs text-slate-400">
                    since{' '}
                    {new Date(
                      analytics.baselineComparison.calibratedAt,
                    ).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
