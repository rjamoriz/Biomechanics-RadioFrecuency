'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';

/* ──────────────────────────────────────────────
 * Signal Diagnostics Dashboard
 *
 * Real-time observatory panel showing signal
 * processing pipeline health, coherence trends,
 * field model status, and Fresnel zone info.
 *
 * All values are estimated proxy metrics —
 * not clinical-grade measurements.
 * ────────────────────────────────────────────── */

// ─── Props ──────────────────────────────────────────────────────────

interface SignalDiagnosticsProps {
  /** Coherence + entropy history (last ~30 seconds) */
  coherenceHistory: Array<{ t: number; coherence: number; entropy: number }>;
  /** Per-stage pass rates */
  pipelineStages: Array<{ name: string; passRate: number }>;
  /** Field model status */
  fieldModel: {
    state: string;
    driftScore: number;
    motionEnergy: number;
    calibrationAge: number;
  };
  /** Fresnel zone summary */
  fresnelZone: {
    zoneMargin: number;
    inZone: boolean;
    signalQuality: number;
  };
  /** Coherence gate acceptance rate [0, 1] */
  gateAcceptanceRate: number;
  /** Decoherence event markers */
  decoherenceEvents: Array<{ t: number; magnitude: number }>;
}

// ─── Helpers ────────────────────────────────────────────────────────

function passRateColor(rate: number): string {
  if (rate >= 0.9) return 'bg-green-500';
  if (rate >= 0.7) return 'bg-yellow-500';
  return 'bg-red-500';
}

function passRateTextColor(rate: number): string {
  if (rate >= 0.9) return 'text-green-400';
  if (rate >= 0.7) return 'text-yellow-400';
  return 'text-red-400';
}

function stateColor(state: string): string {
  switch (state) {
    case 'calibrated':
      return 'text-green-400';
    case 'calibrating':
    case 'recalibrating':
      return 'text-blue-400';
    case 'drifting':
      return 'text-yellow-400';
    default:
      return 'text-slate-400';
  }
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

// ─── Sub-panels ─────────────────────────────────────────────────────

function CoherenceTimeline({
  data,
  events,
}: {
  data: Array<{ t: number; coherence: number; entropy: number }>;
  events: Array<{ t: number; magnitude: number }>;
}) {
  // Normalize timestamps to relative seconds
  const baseT = data.length > 0 ? data[0].t : 0;
  const chartData = data.map((d) => ({
    sec: ((d.t - baseT) / 1000).toFixed(1),
    coherence: d.coherence,
    entropy: d.entropy,
  }));

  const eventTimes = new Set(
    events.map((e) => ((e.t - baseT) / 1000).toFixed(1)),
  );

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Coherence &amp; Entropy Timeline
      </h3>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="sec"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 1]}
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              tickLine={false}
              width={30}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #475569',
                borderRadius: 6,
                fontSize: 11,
              }}
            />
            <Area
              type="monotone"
              dataKey="coherence"
              stroke="#22c55e"
              fill="#22c55e"
              fillOpacity={0.1}
              strokeWidth={1.5}
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="entropy"
              stroke="#ef4444"
              fill="#ef4444"
              fillOpacity={0.05}
              strokeWidth={1.5}
              dot={false}
            />
            {/* Decoherence event markers */}
            {Array.from(eventTimes).map((sec) => (
              <ReferenceLine
                key={sec}
                x={sec}
                stroke="#f59e0b"
                strokeDasharray="2 2"
                strokeWidth={1}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex items-center gap-4 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-3 rounded bg-green-500" /> Coherence
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-3 rounded bg-red-500" /> Entropy
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-3 rounded border border-yellow-500" /> Decoherence Event
        </span>
      </div>
    </div>
  );
}

function PipelineHealth({
  stages,
}: {
  stages: Array<{ name: string; passRate: number }>;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Pipeline Stage Health
      </h3>
      <div className="space-y-1.5">
        {stages.map((s) => (
          <div key={s.name} className="flex items-center gap-2">
            <span className="w-24 truncate text-[11px] text-slate-300 font-mono">
              {s.name}
            </span>
            <div className="flex-1 h-3 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${passRateColor(s.passRate)}`}
                style={{ width: `${Math.round(s.passRate * 100)}%` }}
              />
            </div>
            <span className={`w-10 text-right text-[11px] font-mono ${passRateTextColor(s.passRate)}`}>
              {(s.passRate * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldModelStatus({
  fieldModel,
}: {
  fieldModel: SignalDiagnosticsProps['fieldModel'];
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Field Model
      </h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
        <span className="text-slate-500">State</span>
        <span className={`font-mono font-semibold ${stateColor(fieldModel.state)}`}>
          {fieldModel.state}
        </span>
        <span className="text-slate-500">Drift score</span>
        <span className="font-mono text-slate-300">
          {(fieldModel.driftScore * 100).toFixed(1)}%
        </span>
        <span className="text-slate-500">Motion energy</span>
        <span className="font-mono text-slate-300">
          {fieldModel.motionEnergy.toFixed(3)}
        </span>
        <span className="text-slate-500">Baseline age</span>
        <span className={`font-mono ${fieldModel.calibrationAge > 3600 ? 'text-yellow-400' : 'text-slate-300'}`}>
          {formatAge(fieldModel.calibrationAge)}
        </span>
      </div>
    </div>
  );
}

function FresnelIndicator({
  fresnelZone,
}: {
  fresnelZone: SignalDiagnosticsProps['fresnelZone'];
}) {
  const marginPct = Math.round(fresnelZone.zoneMargin * 100);
  const gaugeColor =
    marginPct >= 60 ? 'bg-green-500' : marginPct >= 30 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Fresnel Zone
      </h3>
      <div className="flex items-center gap-3">
        {/* Gauge bar */}
        <div className="flex-1">
          <div className="h-4 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${gaugeColor}`}
              style={{ width: `${marginPct}%` }}
            />
          </div>
          <div className="mt-0.5 flex justify-between text-[10px] text-slate-500">
            <span>Edge</span>
            <span>Center</span>
          </div>
        </div>
        <div className="text-right text-[11px] space-y-0.5">
          <div className="font-mono text-slate-200">{marginPct}%</div>
          <div
            className={`text-[10px] font-semibold ${fresnelZone.inZone ? 'text-green-400' : 'text-red-400'}`}
          >
            {fresnelZone.inZone ? 'In Zone' : 'Outside'}
          </div>
        </div>
      </div>
    </div>
  );
}

function AcceptanceRateGauge({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const color =
    pct >= 80 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Gate Acceptance
      </h3>
      <div className="flex items-baseline gap-1">
        <span className={`text-2xl font-bold font-mono ${color}`}>{pct}</span>
        <span className="text-sm text-slate-500">%</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export function SignalDiagnostics({
  coherenceHistory,
  pipelineStages,
  fieldModel,
  fresnelZone,
  gateAcceptanceRate,
  decoherenceEvents,
}: SignalDiagnosticsProps) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-200">
          Signal Diagnostics
        </h2>
        <span className="text-[10px] rounded bg-slate-800 px-2 py-0.5 text-slate-500">
          Estimated proxy metrics — not clinical-grade
        </span>
      </div>

      {/* Row 1: Coherence timeline */}
      <CoherenceTimeline data={coherenceHistory} events={decoherenceEvents} />

      {/* Row 2: Pipeline + Field Model + Fresnel + Gate */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <PipelineHealth stages={pipelineStages} />
        <FieldModelStatus fieldModel={fieldModel} />
        <FresnelIndicator fresnelZone={fresnelZone} />
        <AcceptanceRateGauge rate={gateAcceptanceRate} />
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-slate-600 text-center">
        Signal diagnostics are derived from Wi-Fi CSI processing pipeline
        estimates. They do not represent exact electromagnetic measurements.
      </p>
    </div>
  );
}
