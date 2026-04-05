'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import {
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  AlertTriangle,
  Footprints,
  Activity,
  Timer,
} from 'lucide-react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfidenceIndicator } from '@/components/ui/confidence-indicator';
import { ValidationBadge } from '@/components/ui/validation-badge';
import { useSession } from '@/hooks/use-sessions';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  formatCadence,
  formatConfidence,
  formatDuration,
  formatSpeed,
  formatIncline,
} from '@/lib/format';

// ── Replay Data Types ───────────────────────────────────────────

interface ReplayDataPoint {
  timestampMs: number;
  estimatedCadence: number;
  symmetryProxy: number;
  contactTimeProxy: number;
  flightTimeProxy: number;
  formStabilityScore: number;
  fatigueDriftScore: number;
  signalQualityScore: number;
  metricConfidence: number;
}

interface ReplayStage {
  name: string;
  startMs: number;
  endMs: number;
  speedKmh: number;
  inclinePercent: number;
  type: 'warm-up' | 'steady' | 'interval' | 'cool-down' | 'custom';
}

interface ReplayEvent {
  timestampMs: number;
  type: 'manual-note' | 'stage-transition' | 'signal-drop';
  description: string;
}

interface ReplayStageSummary {
  name: string;
  speedKmh: number;
  inclinePercent: number;
  durationSeconds: number;
  avgCadence: number;
  avgSymmetry: number;
  avgContactTime: number;
  avgConfidence: number;
}

interface ReplayData {
  sessionId: string;
  totalDurationMs: number;
  dataPoints: ReplayDataPoint[];
  stages: ReplayStage[];
  events: ReplayEvent[];
  stageSummaries: ReplayStageSummary[];
  overallSignalQuality: number;
  validationStatus: string;
}

// ── Stage color mapping ─────────────────────────────────────────

const stageColors: Record<string, { fill: string; stroke: string }> = {
  'warm-up': { fill: 'rgba(59,130,246,0.08)', stroke: '#3b82f6' },
  steady: { fill: 'rgba(34,197,94,0.08)', stroke: '#22c55e' },
  interval: { fill: 'rgba(249,115,22,0.08)', stroke: '#f97316' },
  'cool-down': { fill: 'rgba(168,85,247,0.08)', stroke: '#a855f7' },
  custom: { fill: 'rgba(107,114,128,0.08)', stroke: '#6b7280' },
};

const PLAYBACK_SPEEDS = [1, 2, 4] as const;

// ── Main Component ──────────────────────────────────────────────

export default function SessionReplayPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;

  const { data: session } = useSession(sessionId);

  const {
    data: replay,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['session-replay', sessionId],
    queryFn: () =>
      apiFetch<ReplayData>(`/sessions/${encodeURIComponent(sessionId)}/replay`),
    enabled: !!sessionId,
  });

  // Playback state
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [speed, setSpeed] = useState<(typeof PLAYBACK_SPEEDS)[number]>(1);

  const totalDuration = replay?.totalDurationMs ?? 0;

  // Auto-advance playback
  useEffect(() => {
    if (!playing || !replay) return;
    const interval = setInterval(() => {
      setPositionMs((prev) => {
        const next = prev + 100 * speed;
        if (next >= totalDuration) {
          setPlaying(false);
          return totalDuration;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [playing, speed, totalDuration, replay]);

  const handleReset = useCallback(() => {
    setPlaying(false);
    setPositionMs(0);
  }, []);

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!totalDuration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, x / rect.width));
      setPositionMs(Math.round(pct * totalDuration));
    },
    [totalDuration],
  );

  // Chart data with time in seconds for display
  const chartData = useMemo(() => {
    if (!replay) return [];
    return replay.dataPoints.map((dp) => ({
      timeSec: dp.timestampMs / 1000,
      estimatedCadence: dp.estimatedCadence,
      symmetryProxy: dp.symmetryProxy,
      contactTimeProxy: dp.contactTimeProxy,
      metricConfidence: dp.metricConfidence,
      signalQualityScore: dp.signalQualityScore,
    }));
  }, [replay]);

  const currentPositionSec = positionMs / 1000;

  // ── Loading / Error states ──────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Session Replay</h1>
        <Card className="py-12 text-center">
          <p className="text-sm text-slate-500">Loading replay data...</p>
        </Card>
      </div>
    );
  }

  if (error || !replay) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Session Replay</h1>
        <Card className="py-12 text-center">
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-400" />
          <p className="mt-4 text-sm text-slate-500">
            No replay data available for this session.
          </p>
          <Link
            href={`/sessions/${sessionId}`}
            className="mt-4 inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"
          >
            <ChevronLeft className="h-4 w-4" /> Back to session
          </Link>
        </Card>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/sessions/${sessionId}`}
            className="text-slate-400 hover:text-slate-600"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Session Replay</h1>
            {session && (
              <p className="text-sm text-slate-500">
                {session.athleteName} — {session.stationName}
              </p>
            )}
          </div>
        </div>
        <ValidationBadge status={replay.validationStatus as never} />
      </div>

      {/* Timeline + Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>

        {/* Playback controls */}
        <div className="mb-4 flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPlaying(!playing)}
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1">
            {PLAYBACK_SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={cn(
                  'rounded px-2 py-1 text-xs font-medium transition-colors',
                  speed === s
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-500 hover:bg-slate-100',
                )}
              >
                {s}x
              </button>
            ))}
          </div>
          <span className="ml-auto text-sm font-mono text-slate-600">
            {formatDuration(Math.floor(positionMs / 1000))} /{' '}
            {formatDuration(Math.floor(totalDuration / 1000))}
          </span>
        </div>

        {/* Timeline bar */}
        <div
          className="relative h-10 cursor-pointer rounded-lg bg-slate-50 border border-slate-200 overflow-hidden"
          onClick={handleTimelineClick}
        >
          {/* Stage overlays */}
          {replay.stages.map((stage, i) => {
            const left = (stage.startMs / totalDuration) * 100;
            const width = ((stage.endMs - stage.startMs) / totalDuration) * 100;
            const colors = stageColors[stage.type] ?? stageColors.custom;
            return (
              <div
                key={i}
                className="absolute inset-y-0"
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  backgroundColor: colors.fill,
                  borderLeft: `2px solid ${colors.stroke}`,
                }}
                title={`${stage.name} (${formatSpeed(stage.speedKmh)}, ${formatIncline(stage.inclinePercent)})`}
              >
                <span className="absolute bottom-0.5 left-1 text-[10px] font-medium text-slate-500 truncate max-w-full">
                  {stage.name}
                </span>
              </div>
            );
          })}

          {/* Event markers */}
          {replay.events.map((evt, i) => {
            const left = (evt.timestampMs / totalDuration) * 100;
            const markerColor =
              evt.type === 'signal-drop'
                ? 'bg-red-500'
                : evt.type === 'stage-transition'
                  ? 'bg-blue-500'
                  : 'bg-amber-500';
            return (
              <div
                key={i}
                className={cn('absolute top-0 h-full w-0.5', markerColor)}
                style={{ left: `${left}%` }}
                title={`${evt.type}: ${evt.description}`}
              />
            );
          })}

          {/* Playback position */}
          <div
            className="absolute top-0 h-full w-0.5 bg-brand-600 z-10"
            style={{ left: `${(positionMs / totalDuration) * 100}%` }}
          >
            <div className="absolute -top-1.5 -left-1.5 h-4 w-4 rounded-full border-2 border-brand-600 bg-white" />
          </div>
        </div>
      </Card>

      {/* Metric Charts */}
      <div className="grid gap-6 lg:grid-cols-1">
        <ReplayChart
          title="Estimated Cadence"
          icon={<Footprints className="h-4 w-4 text-slate-400" />}
          data={chartData}
          dataKey="estimatedCadence"
          color="#2563eb"
          unit=" spm"
          stages={replay.stages}
          events={replay.events}
          totalDurationMs={totalDuration}
          currentPositionSec={currentPositionSec}
        />
        <ReplayChart
          title="Symmetry Proxy"
          icon={<Activity className="h-4 w-4 text-slate-400" />}
          data={chartData}
          dataKey="symmetryProxy"
          color="#16a34a"
          unit="%"
          valueMultiplier={100}
          domain={[0, 100]}
          stages={replay.stages}
          events={replay.events}
          totalDurationMs={totalDuration}
          currentPositionSec={currentPositionSec}
        />
        <ReplayChart
          title="Contact-Time Proxy"
          icon={<Timer className="h-4 w-4 text-slate-400" />}
          data={chartData}
          dataKey="contactTimeProxy"
          color="#ea580c"
          unit=" ms"
          stages={replay.stages}
          events={replay.events}
          totalDurationMs={totalDuration}
          currentPositionSec={currentPositionSec}
        />
      </div>

      {/* Stage Summaries */}
      <Card>
        <CardHeader>
          <CardTitle>Per-Stage Summary</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase border-b border-slate-200">
              <tr>
                <th className="px-4 py-2">Stage</th>
                <th className="px-4 py-2">Speed</th>
                <th className="px-4 py-2">Incline</th>
                <th className="px-4 py-2">Duration</th>
                <th className="px-4 py-2">Avg Cadence</th>
                <th className="px-4 py-2">Avg Symmetry</th>
                <th className="px-4 py-2">Avg Contact-Time</th>
                <th className="px-4 py-2">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {replay.stageSummaries.map((s, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-900">{s.name}</td>
                  <td className="px-4 py-2">{formatSpeed(s.speedKmh)}</td>
                  <td className="px-4 py-2">{formatIncline(s.inclinePercent)}</td>
                  <td className="px-4 py-2">{formatDuration(s.durationSeconds)}</td>
                  <td className="px-4 py-2">{formatCadence(s.avgCadence)}</td>
                  <td className="px-4 py-2">{(s.avgSymmetry * 100).toFixed(1)}%</td>
                  <td className="px-4 py-2">{s.avgContactTime.toFixed(0)} ms</td>
                  <td className="px-4 py-2">
                    <Badge variant={s.avgConfidence >= 0.8 ? 'success' : s.avgConfidence >= 0.5 ? 'warning' : 'danger'}>
                      {formatConfidence(s.avgConfidence)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Session Totals */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-xs text-slate-500">Overall Signal Quality</p>
          <ConfidenceIndicator value={replay.overallSignalQuality} label="Signal Quality" />
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Validation Status</p>
          <div className="mt-2">
            <ValidationBadge status={replay.validationStatus as never} />
          </div>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Total Duration</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {formatDuration(Math.floor(totalDuration / 1000))}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500">Stages</p>
          <p className="mt-1 text-lg font-semibold text-slate-900">
            {replay.stages.length}
          </p>
        </Card>
      </div>

      {/* Scientific disclaimer */}
      <p className="text-xs text-slate-400 text-center">
        Metrics shown are proxy estimates derived from Wi-Fi CSI sensing. They are
        not clinical-grade measurements. Confidence and validation status are shown
        alongside each metric.
      </p>
    </div>
  );
}

// ── Reusable Chart Component ────────────────────────────────────

function ReplayChart({
  title,
  icon,
  data,
  dataKey,
  color,
  unit,
  valueMultiplier,
  domain,
  stages,
  events,
  totalDurationMs,
  currentPositionSec,
}: {
  title: string;
  icon: React.ReactNode;
  data: Array<Record<string, number>>;
  dataKey: string;
  color: string;
  unit: string;
  valueMultiplier?: number;
  domain?: [number, number];
  stages: ReplayStage[];
  events: ReplayEvent[];
  totalDurationMs: number;
  currentPositionSec: number;
}) {
  const multiplier = valueMultiplier ?? 1;

  return (
    <Card>
      <CardHeader className="mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle>{title}</CardTitle>
        </div>
      </CardHeader>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="timeSec"
            tickFormatter={(v: number) => formatDuration(Math.floor(v))}
            stroke="#94a3b8"
            fontSize={11}
          />
          <YAxis
            domain={domain}
            stroke="#94a3b8"
            fontSize={11}
            tickFormatter={(v: number) => `${(v * multiplier).toFixed(0)}${unit}`}
          />
          <Tooltip
            formatter={(v: number) => [`${(v * multiplier).toFixed(1)}${unit}`, title]}
            labelFormatter={(v: number) => formatDuration(Math.floor(v as number))}
          />

          {/* Confidence-based background regions */}
          {data
            .reduce<Array<{ startSec: number; endSec: number; level: string }>>((acc, dp) => {
              const level =
                dp.metricConfidence >= 0.8 ? 'high' : dp.metricConfidence >= 0.5 ? 'medium' : 'low';
              const prev = acc[acc.length - 1];
              if (prev && prev.level === level) {
                prev.endSec = dp.timeSec;
              } else {
                acc.push({ startSec: dp.timeSec, endSec: dp.timeSec, level });
              }
              return acc;
            }, [])
            .map((region, i) => {
              const fill =
                region.level === 'high'
                  ? 'rgba(34,197,94,0.06)'
                  : region.level === 'medium'
                    ? 'rgba(245,158,11,0.06)'
                    : 'rgba(239,68,68,0.06)';
              return (
                <ReferenceArea
                  key={`conf-${i}`}
                  x1={region.startSec}
                  x2={region.endSec}
                  fill={fill}
                  fillOpacity={1}
                />
              );
            })}

          {/* Stage boundary lines */}
          {stages.map((s, i) => (
            <ReferenceLine
              key={`stage-${i}`}
              x={s.startMs / 1000}
              stroke="#94a3b8"
              strokeDasharray="4 4"
              label={{ value: s.name, position: 'top', fontSize: 10 }}
            />
          ))}

          {/* Event markers */}
          {events
            .filter((e) => e.type === 'signal-drop')
            .map((e, i) => (
              <ReferenceLine
                key={`evt-${i}`}
                x={e.timestampMs / 1000}
                stroke="#ef4444"
                strokeDasharray="2 2"
              />
            ))}

          {/* Current position */}
          <ReferenceLine x={currentPositionSec} stroke="#2563eb" strokeWidth={2} />

          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
