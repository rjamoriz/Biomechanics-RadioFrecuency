'use client';

import React from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

/* ──────────────────────────────────────────────
 * Observatory Multi-Panel Dashboard
 *
 * Comprehensive full-screen observatory view
 * for operators showing all aspects of signal
 * processing health, from raw CSI to final metrics.
 *
 * All values are estimated proxy metrics —
 * not clinical-grade measurements.
 * ────────────────────────────────────────────── */

// ─── Props ──────────────────────────────────────────────────────────

interface ObservatoryDashboardProps {
  stationGeometry?: {
    txPosition: [number, number, number];
    rxPosition: [number, number, number];
    treadmillCenter: [number, number, number];
    treadmillLength: number;
    treadmillWidth: number;
    primaryZoneRadius: number;
    zoneMargin: number;
    signalQuality: number;
    presenceDetected: boolean;
  };
  coherenceHistory: Array<{
    t: number;
    coherence: number;
    entropy: number;
    gateAcceptance: number;
  }>;
  pipelineStages: Array<{ name: string; passRate: number; avgLatencyMs: number }>;
  aoaHistory: Array<{
    t: number;
    angleDeg: number;
    lateralDisplacement: number;
    confidence: number;
  }>;
  channels: Array<{
    channel: number;
    signalQuality: number;
    packetRate: number;
    isActive: boolean;
  }>;
  fusion?: {
    stationWeights: Record<string, number>;
    metricAgreement: Record<string, number>;
    consensusConfidence: number;
    stationCount: number;
  };
  adaptation?: {
    warmupProgress: number;
    baselineEstablished: boolean;
    deviations: Record<string, { zScore: number; isAnomaly: boolean }>;
    overallAnomalyScore: number;
  };
  fieldModel: {
    state: string;
    driftScore: number;
    motionEnergy: number;
    calibrationAge: number;
  };
}

// ─── Color Palette (professional sports-tech) ──────────────────────

const COLORS = {
  primary: '#3b82f6',
  secondary: '#8b5cf6',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
  muted: '#6b7280',
  bgCard: '#111827',
  bgCardHover: '#1f2937',
  border: '#374151',
  text: '#f9fafb',
  textMuted: '#9ca3af',
};

function qualityColor(value: number): string {
  if (value >= 0.7) return COLORS.success;
  if (value >= 0.4) return COLORS.warning;
  return COLORS.danger;
}

function stateColor(state: string): string {
  switch (state) {
    case 'calibrated':
      return COLORS.success;
    case 'calibrating':
    case 'recalibrating':
      return COLORS.warning;
    case 'drifting':
      return COLORS.danger;
    default:
      return COLORS.muted;
  }
}

// ─── Panel Components ───────────────────────────────────────────────

function PanelCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg border p-4 flex flex-col"
      style={{
        backgroundColor: COLORS.bgCard,
        borderColor: COLORS.border,
      }}
    >
      <h3
        className="text-sm font-medium mb-3 flex-shrink-0"
        style={{ color: COLORS.textMuted }}
      >
        {title}
      </h3>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

/** Panel 2: Coherence Timeline — coherence + entropy + gate acceptance */
function CoherencePanel({
  data,
}: {
  data: ObservatoryDashboardProps['coherenceHistory'];
}) {
  const formatted = data.map((d) => ({
    t: new Date(d.t).toLocaleTimeString(),
    coherence: Math.round(d.coherence * 100) / 100,
    entropy: Math.round(d.entropy * 100) / 100,
    gate: Math.round(d.gateAcceptance * 100) / 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={formatted}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis
          dataKey="t"
          tick={{ fontSize: 10, fill: COLORS.textMuted }}
          interval="preserveStartEnd"
        />
        <YAxis domain={[0, 1]} tick={{ fontSize: 10, fill: COLORS.textMuted }} />
        <Tooltip
          contentStyle={{
            backgroundColor: COLORS.bgCardHover,
            border: `1px solid ${COLORS.border}`,
            color: COLORS.text,
          }}
        />
        <Line
          type="monotone"
          dataKey="coherence"
          stroke={COLORS.primary}
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="entropy"
          stroke={COLORS.secondary}
          strokeWidth={1}
          dot={false}
          strokeDasharray="4 2"
        />
        <Line
          type="monotone"
          dataKey="gate"
          stroke={COLORS.success}
          strokeWidth={1}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Panel 3: Pipeline Health — horizontal bars for stage pass rates */
function PipelinePanel({
  stages,
}: {
  stages: ObservatoryDashboardProps['pipelineStages'];
}) {
  const data = stages.map((s) => ({
    name: s.name,
    passRate: Math.round(s.passRate * 100),
    latency: s.avgLatencyMs,
  }));

  return (
    <div className="space-y-2">
      {data.map((stage) => (
        <div key={stage.name} className="flex items-center gap-2">
          <span
            className="text-xs w-24 truncate flex-shrink-0"
            style={{ color: COLORS.textMuted }}
          >
            {stage.name}
          </span>
          <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ backgroundColor: COLORS.border }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${stage.passRate}%`,
                backgroundColor: qualityColor(stage.passRate / 100),
              }}
            />
          </div>
          <span className="text-xs w-10 text-right" style={{ color: COLORS.text }}>
            {stage.passRate}%
          </span>
        </div>
      ))}
    </div>
  );
}

/** Panel 4: AoA / Lateral Sway */
function AoAPanel({
  data,
}: {
  data: ObservatoryDashboardProps['aoaHistory'];
}) {
  const formatted = data.map((d) => ({
    t: new Date(d.t).toLocaleTimeString(),
    angle: Math.round(d.angleDeg * 10) / 10,
    lateral: Math.round(d.lateralDisplacement * 1000) / 1000,
    conf: Math.round(d.confidence * 100),
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <LineChart data={formatted}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis
          dataKey="t"
          tick={{ fontSize: 10, fill: COLORS.textMuted }}
          interval="preserveStartEnd"
        />
        <YAxis tick={{ fontSize: 10, fill: COLORS.textMuted }} />
        <Tooltip
          contentStyle={{
            backgroundColor: COLORS.bgCardHover,
            border: `1px solid ${COLORS.border}`,
            color: COLORS.text,
          }}
        />
        <Line
          type="monotone"
          dataKey="angle"
          stroke={COLORS.primary}
          strokeWidth={2}
          dot={false}
          name="Angle (°)"
        />
        <Line
          type="monotone"
          dataKey="lateral"
          stroke={COLORS.warning}
          strokeWidth={1}
          dot={false}
          name="Lateral (m)"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Panel 5: Channel Diversity */
function ChannelPanel({
  channels,
}: {
  channels: ObservatoryDashboardProps['channels'];
}) {
  const data = channels.map((ch) => ({
    name: `Ch ${ch.channel}`,
    quality: Math.round(ch.signalQuality * 100),
    packets: ch.packetRate,
    active: ch.isActive,
  }));

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: COLORS.textMuted }} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: COLORS.textMuted }} />
        <Tooltip
          contentStyle={{
            backgroundColor: COLORS.bgCardHover,
            border: `1px solid ${COLORS.border}`,
            color: COLORS.text,
          }}
        />
        <Bar dataKey="quality" name="Quality %">
          {data.map((entry, index) => (
            <Cell
              key={index}
              fill={entry.active ? qualityColor(entry.quality / 100) : COLORS.muted}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Panel 6: Metric Agreement Radar */
function FusionPanel({
  fusion,
}: {
  fusion: NonNullable<ObservatoryDashboardProps['fusion']>;
}) {
  const radarData = Object.entries(fusion.metricAgreement).map(([key, val]) => ({
    metric: key.replace('estimated', '').replace('Proxy', '').replace('Estimate', ''),
    agreement: Math.round(val * 100),
  }));

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs" style={{ color: COLORS.textMuted }}>
          Consensus: {Math.round(fusion.consensusConfidence * 100)}%
        </span>
        <span className="text-xs" style={{ color: COLORS.textMuted }}>
          | Stations: {fusion.stationCount}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <RadarChart data={radarData}>
          <PolarGrid stroke={COLORS.border} />
          <PolarAngleAxis
            dataKey="metric"
            tick={{ fontSize: 9, fill: COLORS.textMuted }}
          />
          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} />
          <Radar
            dataKey="agreement"
            stroke={COLORS.primary}
            fill={COLORS.primary}
            fillOpacity={0.3}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Panel 7: Athlete Adaptation */
function AdaptationPanel({
  adaptation,
}: {
  adaptation: NonNullable<ObservatoryDashboardProps['adaptation']>;
}) {
  return (
    <div className="space-y-3">
      {/* Warmup progress */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span style={{ color: COLORS.textMuted }}>
            {adaptation.baselineEstablished ? 'Baseline established' : 'Warmup'}
          </span>
          <span style={{ color: COLORS.text }}>
            {Math.round(adaptation.warmupProgress * 100)}%
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: COLORS.border }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${adaptation.warmupProgress * 100}%`,
              backgroundColor: adaptation.baselineEstablished
                ? COLORS.success
                : COLORS.warning,
            }}
          />
        </div>
      </div>

      {/* Deviation gauges */}
      {adaptation.baselineEstablished && (
        <div className="space-y-1">
          {Object.entries(adaptation.deviations).map(([metric, info]) => (
            <div key={metric} className="flex items-center gap-2">
              <span
                className="text-xs w-20 truncate"
                style={{ color: COLORS.textMuted }}
              >
                {metric.replace('estimated', '').replace('Proxy', '')}
              </span>
              <div
                className="flex-1 h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: COLORS.border }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(Math.abs(info.zScore) * 25, 100)}%`,
                    backgroundColor: info.isAnomaly ? COLORS.danger : COLORS.success,
                  }}
                />
              </div>
              <span
                className="text-xs w-8 text-right"
                style={{
                  color: info.isAnomaly ? COLORS.danger : COLORS.text,
                }}
              >
                {info.zScore.toFixed(1)}σ
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Overall anomaly */}
      <div className="text-xs" style={{ color: COLORS.textMuted }}>
        Anomaly score:{' '}
        <span
          style={{
            color:
              adaptation.overallAnomalyScore > 0.6
                ? COLORS.danger
                : adaptation.overallAnomalyScore > 0.3
                  ? COLORS.warning
                  : COLORS.success,
          }}
        >
          {(adaptation.overallAnomalyScore * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

/** Panel 8: Field Model Status */
function FieldModelPanel({
  fieldModel,
}: {
  fieldModel: ObservatoryDashboardProps['fieldModel'];
}) {
  const ageMinutes = Math.round(fieldModel.calibrationAge / 60);

  return (
    <div className="space-y-3">
      {/* State badge */}
      <div className="flex items-center gap-2">
        <div
          className="w-3 h-3 rounded-full"
          style={{ backgroundColor: stateColor(fieldModel.state) }}
        />
        <span className="text-sm font-medium" style={{ color: COLORS.text }}>
          {fieldModel.state.toUpperCase()}
        </span>
      </div>

      {/* Drift score gauge */}
      <div>
        <div className="flex justify-between text-xs mb-1">
          <span style={{ color: COLORS.textMuted }}>Drift score</span>
          <span style={{ color: COLORS.text }}>
            {(fieldModel.driftScore * 100).toFixed(0)}%
          </span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: COLORS.border }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${fieldModel.driftScore * 100}%`,
              backgroundColor: qualityColor(1 - fieldModel.driftScore),
            }}
          />
        </div>
      </div>

      {/* Motion energy */}
      <div className="flex justify-between text-xs">
        <span style={{ color: COLORS.textMuted }}>Motion energy</span>
        <span style={{ color: COLORS.text }}>
          {fieldModel.motionEnergy.toFixed(3)}
        </span>
      </div>

      {/* Calibration age */}
      <div className="flex justify-between text-xs">
        <span style={{ color: COLORS.textMuted }}>Cal. age</span>
        <span
          style={{
            color: ageMinutes > 30 ? COLORS.warning : COLORS.text,
          }}
        >
          {ageMinutes}m
        </span>
      </div>
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────

export function ObservatoryDashboard(props: ObservatoryDashboardProps) {
  return (
    <div className="w-full min-h-screen p-4" style={{ backgroundColor: '#0a0f1a' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold" style={{ color: COLORS.text }}>
          Signal Observatory
        </h2>
        <p className="text-xs" style={{ color: COLORS.textMuted }}>
          Estimated proxy metrics from Wi-Fi CSI — not clinical-grade
        </p>
      </div>

      {/* Grid: 4 cols desktop, 2 tablet, 1 mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Panel 1: Station Geometry placeholder (external component) */}
        <PanelCard title="Station Geometry">
          {props.stationGeometry ? (
            <div className="space-y-2 text-xs" style={{ color: COLORS.textMuted }}>
              <div className="flex justify-between">
                <span>Zone margin</span>
                <span style={{ color: qualityColor(props.stationGeometry.zoneMargin) }}>
                  {(props.stationGeometry.zoneMargin * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span>Signal quality</span>
                <span style={{ color: qualityColor(props.stationGeometry.signalQuality) }}>
                  {(props.stationGeometry.signalQuality * 100).toFixed(0)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span>Presence</span>
                <span
                  style={{
                    color: props.stationGeometry.presenceDetected
                      ? COLORS.success
                      : COLORS.muted,
                  }}
                >
                  {props.stationGeometry.presenceDetected ? 'Detected' : 'None'}
                </span>
              </div>
              <p className="text-xs italic mt-2" style={{ color: COLORS.textMuted }}>
                Use StationGeometry component for 3D Fresnel visualization
              </p>
            </div>
          ) : (
            <p className="text-xs" style={{ color: COLORS.textMuted }}>
              No station geometry available
            </p>
          )}
        </PanelCard>

        {/* Panel 2: Coherence Timeline */}
        <PanelCard title="Coherence Timeline">
          {props.coherenceHistory.length > 0 ? (
            <CoherencePanel data={props.coherenceHistory} />
          ) : (
            <p className="text-xs" style={{ color: COLORS.textMuted }}>
              Awaiting coherence data...
            </p>
          )}
        </PanelCard>

        {/* Panel 3: Pipeline Health */}
        <PanelCard title="Pipeline Health">
          {props.pipelineStages.length > 0 ? (
            <PipelinePanel stages={props.pipelineStages} />
          ) : (
            <p className="text-xs" style={{ color: COLORS.textMuted }}>
              No pipeline data
            </p>
          )}
        </PanelCard>

        {/* Panel 4: AoA / Lateral Sway */}
        <PanelCard title="AoA / Lateral Sway">
          {props.aoaHistory.length > 0 ? (
            <AoAPanel data={props.aoaHistory} />
          ) : (
            <p className="text-xs" style={{ color: COLORS.textMuted }}>
              No AoA estimates available
            </p>
          )}
        </PanelCard>

        {/* Panel 5: Channel Diversity */}
        <PanelCard title="Channel Diversity">
          {props.channels.length > 0 ? (
            <ChannelPanel channels={props.channels} />
          ) : (
            <p className="text-xs" style={{ color: COLORS.textMuted }}>
              Single channel mode
            </p>
          )}
        </PanelCard>

        {/* Panel 6: Metric Agreement (Multi-Station) */}
        <PanelCard title="Metric Agreement">
          {props.fusion ? (
            <FusionPanel fusion={props.fusion} />
          ) : (
            <p className="text-xs" style={{ color: COLORS.textMuted }}>
              Single station — no fusion active
            </p>
          )}
        </PanelCard>

        {/* Panel 7: Athlete Adaptation */}
        <PanelCard title="Athlete Adaptation">
          {props.adaptation ? (
            <AdaptationPanel adaptation={props.adaptation} />
          ) : (
            <p className="text-xs" style={{ color: COLORS.textMuted }}>
              No adaptive classifier active
            </p>
          )}
        </PanelCard>

        {/* Panel 8: Field Model Status */}
        <PanelCard title="Field Model">
          <FieldModelPanel fieldModel={props.fieldModel} />
        </PanelCard>
      </div>

      {/* Footer disclaimer */}
      <p
        className="text-xs text-center mt-4"
        style={{ color: COLORS.textMuted }}
      >
        All displayed values are estimated proxy metrics inferred from Wi-Fi CSI
        sensing. Not clinical-grade measurements.
      </p>
    </div>
  );
}

export default ObservatoryDashboard;
