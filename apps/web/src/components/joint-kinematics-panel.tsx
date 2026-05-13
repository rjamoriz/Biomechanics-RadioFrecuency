'use client';

import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Activity, Info } from 'lucide-react';
import type { JointKinematicsFrame, JointProxyData, RunningGaitPhase } from '@/hooks/use-gateway-socket';

// ─────────────────────────────────────────────────────────────────────────────
// Gait phase labels and cycle position display
// ─────────────────────────────────────────────────────────────────────────────

const PHASE_LABELS: Record<RunningGaitPhase, string> = {
  loading_response: 'Loading',
  mid_stance: 'Mid-Stance',
  terminal_stance: 'Term. Stance',
  toe_off: 'Toe-Off',
  initial_swing: 'Init. Swing',
  mid_swing: 'Mid-Swing',
  terminal_swing: 'Term. Swing',
};

const PHASE_ORDER: RunningGaitPhase[] = [
  'loading_response',
  'mid_stance',
  'terminal_stance',
  'toe_off',
  'initial_swing',
  'mid_swing',
  'terminal_swing',
];

const PHASE_COLORS: Record<RunningGaitPhase, string> = {
  loading_response: 'bg-red-500',
  mid_stance: 'bg-orange-400',
  terminal_stance: 'bg-amber-400',
  toe_off: 'bg-yellow-400',
  initial_swing: 'bg-emerald-400',
  mid_swing: 'bg-teal-400',
  terminal_swing: 'bg-sky-400',
};

// ─────────────────────────────────────────────────────────────────────────────
// Risk color helpers
// ─────────────────────────────────────────────────────────────────────────────

const RISK_BG: Record<JointProxyData['riskLevel'], string> = {
  normal: 'bg-emerald-500',
  elevated: 'bg-amber-500',
  high: 'bg-red-500',
};

const RISK_TEXT: Record<JointProxyData['riskLevel'], string> = {
  normal: 'text-emerald-400',
  elevated: 'text-amber-400',
  high: 'text-red-400',
};

const RISK_BADGE_VARIANT: Record<JointProxyData['riskLevel'], 'success' | 'warning' | 'danger'> = {
  normal: 'success',
  elevated: 'warning',
  high: 'danger',
};

// ─────────────────────────────────────────────────────────────────────────────
// Joint display config
// ─────────────────────────────────────────────────────────────────────────────

interface JointDisplayConfig {
  leftKey: keyof JointKinematicsFrame['joints'];
  rightKey: keyof JointKinematicsFrame['joints'];
  label: string;
  angleLabel: string;
  forceLabel: string;
  maxForceN: number;
}

const JOINT_CONFIGS: JointDisplayConfig[] = [
  {
    leftKey: 'leftKnee', rightKey: 'rightKnee',
    label: 'Knee', angleLabel: 'Flexion',
    forceLabel: 'Quad Force Proxy', maxForceN: 3000,
  },
  {
    leftKey: 'leftHip', rightKey: 'rightHip',
    label: 'Hip', angleLabel: 'Flex/Ext',
    forceLabel: 'Hip Force Proxy', maxForceN: 2000,
  },
  {
    leftKey: 'leftAnkle', rightKey: 'rightAnkle',
    label: 'Ankle', angleLabel: 'Dorsi/Plantar',
    forceLabel: 'Gastroc Force Proxy', maxForceN: 2500,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function GaitCycleBar({ phase, position, side }: {
  phase: RunningGaitPhase;
  position: number;
  side: 'L' | 'R';
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{side === 'L' ? 'Left' : 'Right'} leg</span>
        <span className="font-mono">{(position * 100).toFixed(0)}%</span>
      </div>
      <div className="relative h-4 w-full overflow-hidden rounded-full bg-slate-700">
        {/* Phase segments */}
        {PHASE_ORDER.map((p, i) => {
          const widths = [12, 18, 20, 12, 13, 12, 13]; // % widths per phase
          const offset = widths.slice(0, i).reduce((a, b) => a + b, 0);
          return (
            <div
              key={p}
              className={`absolute h-full opacity-30 ${PHASE_COLORS[p]} ${p === phase ? 'opacity-100' : ''}`}
              style={{ left: `${offset}%`, width: `${widths[i]}%` }}
            />
          );
        })}
        {/* Position cursor */}
        <div
          className="absolute top-0 h-full w-0.5 bg-white shadow-glow"
          style={{ left: `${position * 100}%` }}
        />
      </div>
      <div className="text-xs font-medium text-slate-300">
        {PHASE_LABELS[phase]}
      </div>
    </div>
  );
}

function JointForceBar({ value, max, riskLevel }: {
  value: number;
  max: number;
  riskLevel: JointProxyData['riskLevel'];
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
      <div
        className={`h-full rounded-full transition-all duration-150 ${RISK_BG[riskLevel]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function BilateralJointCard({ config, frame }: {
  config: JointDisplayConfig;
  frame: JointKinematicsFrame;
}) {
  const left = frame.joints[config.leftKey] as JointProxyData;
  const right = frame.joints[config.rightKey] as JointProxyData;
  const worstRisk = [left.riskLevel, right.riskLevel].includes('high')
    ? 'high'
    : [left.riskLevel, right.riskLevel].includes('elevated')
      ? 'elevated'
      : 'normal';
  const angleDiff = Math.abs(left.angleProxyDeg - right.angleProxyDeg);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-200">{config.label}</span>
        <div className="flex items-center gap-2">
          {angleDiff > 8 && (
            <span className="flex items-center gap-1 text-xs text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              {angleDiff.toFixed(0)}° asymmetry
            </span>
          )}
          <Badge variant={RISK_BADGE_VARIANT[worstRisk]}>
            {worstRisk}
          </Badge>
        </div>
      </div>

      {/* L / R comparison */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {([['L', left], ['R', right]] as const).map(([side, joint]) => (
          <div key={side} className="space-y-1.5">
            <div className="flex items-center justify-between text-slate-400">
              <span className="font-semibold text-slate-300">{side === 'L' ? 'Left' : 'Right'}</span>
              <span className={RISK_TEXT[joint.riskLevel]}>{joint.riskLevel}</span>
            </div>
            <div className="font-mono text-lg font-bold text-slate-100">
              {joint.angleProxyDeg.toFixed(1)}°
            </div>
            <div className="text-slate-400">{config.angleLabel}</div>
            <JointForceBar value={joint.forceProxyN} max={config.maxForceN} riskLevel={joint.riskLevel} />
            <div className="flex justify-between text-slate-400">
              <span>{config.forceLabel}</span>
              <span className="font-mono">{joint.forceProxyN.toFixed(0)} N</span>
            </div>
            {Math.abs(joint.displacementFromBaselineDeg) > 2 && (
              <div className={`text-xs ${Math.abs(joint.displacementFromBaselineDeg) > 5 ? 'text-amber-400' : 'text-slate-400'}`}>
                {joint.displacementFromBaselineDeg > 0 ? '+' : ''}{joint.displacementFromBaselineDeg.toFixed(1)}° vs baseline
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function LowerBackCard({ joint }: { joint: JointProxyData }) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-200">Lower Back</span>
        <Badge variant={RISK_BADGE_VARIANT[joint.riskLevel]}>{joint.riskLevel}</Badge>
      </div>
      <div className="flex items-end gap-3">
        <span className="font-mono text-2xl font-bold text-slate-100">
          {joint.angleProxyDeg.toFixed(1)}°
        </span>
        <span className="mb-1 text-xs text-slate-400">Trunk lean proxy</span>
      </div>
      {joint.displacementFromBaselineDeg > 2 && (
        <div className={`text-xs ${joint.displacementFromBaselineDeg > 5 ? 'text-amber-400' : 'text-slate-400'}`}>
          +{joint.displacementFromBaselineDeg.toFixed(1)}° vs session baseline (fatigue signal)
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
        <div
          className={`h-full rounded-full ${RISK_BG[joint.riskLevel]}`}
          style={{ width: `${Math.min(100, (joint.angleProxyDeg / 30) * 100)}%` }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface JointKinematicsPanelProps {
  frame: JointKinematicsFrame;
}

export function JointKinematicsPanel({ frame }: JointKinematicsPanelProps) {
  const hasHighRisk = frame.highestRiskJoint !== '' &&
    Object.values(frame.joints).some((j) => (j as JointProxyData).riskLevel === 'high');
  const symmetryPct = (frame.bilateralSymmetryScore * 100).toFixed(0);

  return (
    <Card className="bg-slate-900 text-slate-100 border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-sky-400" />
            <CardTitle className="text-base text-slate-100">
              Joint Kinematics — Proxy Estimates
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">
              Symmetry proxy: <span className={`font-semibold ${frame.bilateralSymmetryScore > 0.8 ? 'text-emerald-400' : frame.bilateralSymmetryScore > 0.6 ? 'text-amber-400' : 'text-red-400'}`}>{symmetryPct}%</span>
            </span>
            <Badge variant="warning">Experimental</Badge>
          </div>
        </div>
      </CardHeader>

      <div className="space-y-4 px-4 pb-4">
        {/* Scientific disclaimer */}
        <div className="flex items-start gap-2 rounded-lg border border-sky-800 bg-sky-950/40 p-2 text-xs text-sky-300">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>
            Proxy estimates inferred from Wi-Fi CSI gait signals. Not optical motion capture.
            Values carry ±20–35% uncertainty. Do not use for clinical assessment.
          </span>
        </div>

        {/* High-risk alert */}
        {hasHighRisk && (
          <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-950/40 p-2 text-xs text-red-300">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>
              Elevated load detected at <strong>{frame.highestRiskJoint}</strong>.
              Consider reducing speed or reviewing form.
            </span>
          </div>
        )}

        {/* Gait cycle bars */}
        <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3 space-y-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Gait Phase</p>
          <GaitCycleBar phase={frame.leftLegPhase} position={frame.gaitCyclePositionLeft} side="L" />
          <GaitCycleBar phase={frame.rightLegPhase} position={frame.gaitCyclePositionRight} side="R" />
          <div className="flex flex-wrap gap-2 pt-1">
            {PHASE_ORDER.map((p) => (
              <span key={p} className="flex items-center gap-1 text-xs text-slate-400">
                <span className={`inline-block h-2 w-2 rounded-full ${PHASE_COLORS[p]}`} />
                {PHASE_LABELS[p]}
              </span>
            ))}
          </div>
        </div>

        {/* Per-joint bilateral cards */}
        <div className="grid gap-3 sm:grid-cols-3">
          {JOINT_CONFIGS.map((cfg) => (
            <BilateralJointCard key={cfg.label} config={cfg} frame={frame} />
          ))}
        </div>

        {/* Lower back */}
        <LowerBackCard joint={frame.joints.lowerBack} />

        {/* Speed / incline context */}
        <div className="flex gap-4 text-xs text-slate-400">
          <span>Speed: <strong className="text-slate-200">{frame.speedKmh.toFixed(1)} km/h</strong></span>
          <span>Incline: <strong className="text-slate-200">{frame.inclinePercent.toFixed(1)}%</strong></span>
          <span className="ml-auto italic text-slate-500">{frame.disclaimer.slice(0, 60)}...</span>
        </div>
      </div>
    </Card>
  );
}
