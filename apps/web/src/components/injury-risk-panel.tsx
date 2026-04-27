'use client';

import { AlertTriangle, Activity, ShieldCheck, Info } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfidenceIndicator } from '@/components/ui/confidence-indicator';
import { ValidationBadge } from '@/components/ui/validation-badge';
import { ArticulationRiskChart } from '@/components/articulation-risk-chart';
import type { LiveInjuryRiskSnapshot, InjuryRiskLevel } from '@/types/injury-risk';
import {
  RISK_LEVEL_COLORS,
  RISK_LEVEL_BG,
  JOINT_LABELS,
  INJURY_RISK_DISCLAIMER,
} from '@/types/injury-risk';

// ─── Sub-components ──────────────────────────────────────────────────

function RiskScore({ score, level }: { score: number; level: InjuryRiskLevel }) {
  const color = RISK_LEVEL_COLORS[level];
  const bg = RISK_LEVEL_BG[level];

  return (
    <div className={`flex items-center gap-4 rounded-xl border p-5 ${bg}`}>
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-500">Overall Injury Risk</p>
        <p className={`mt-1 text-4xl font-bold tabular-nums ${color}`}>
          {Math.round(score * 100)}
          <span className="ml-1 text-xl font-normal text-slate-400">/ 100</span>
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Badge
          className={`text-sm font-semibold capitalize ${color}`}
          variant="outline"
        >
          {level}
        </Badge>
        <span className="text-xs text-slate-400">proxy estimate</span>
      </div>
    </div>
  );
}

function RiskFactorRow({ factor }: { factor: LiveInjuryRiskSnapshot['riskFactors'][number] }) {
  const pct = Math.round(factor.value * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className={`font-medium ${factor.elevated ? 'text-red-400' : 'text-slate-300'}`}>
          {factor.elevated && <AlertTriangle className="mr-1 inline h-3 w-3" />}
          {factor.label}
        </span>
        <span className={`tabular-nums font-semibold ${factor.elevated ? 'text-red-400' : 'text-slate-400'}`}>
          {pct}%
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            factor.elevated ? 'bg-red-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-slate-500">{factor.description}</p>
    </div>
  );
}

function ArticulationTable({ articulationRisks }: { articulationRisks: LiveInjuryRiskSnapshot['articulationRisks'] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-700">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-700 bg-slate-800/50">
            <th className="px-4 py-2 text-left font-medium text-slate-400">Joint</th>
            <th className="px-4 py-2 text-right font-medium text-slate-400">Risk</th>
            <th className="px-4 py-2 text-right font-medium text-slate-400">Level</th>
            <th className="px-4 py-2 text-left font-medium text-slate-400">Driver</th>
          </tr>
        </thead>
        <tbody>
          {articulationRisks.map((a) => (
            <tr key={a.joint} className="border-b border-slate-700/50 last:border-0">
              <td className="px-4 py-2 text-slate-300">{JOINT_LABELS[a.joint]}</td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums text-slate-200">
                {Math.round(a.riskScore * 100)}%
              </td>
              <td className={`px-4 py-2 text-right font-medium capitalize ${RISK_LEVEL_COLORS[a.riskLevel]}`}>
                {a.riskLevel}
              </td>
              <td className="px-4 py-2 text-xs text-slate-500">
                {a.primaryDriver.replace(/_/g, ' ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main panel ──────────────────────────────────────────────────────

export interface InjuryRiskPanelProps {
  snapshot: LiveInjuryRiskSnapshot | null;
  loading?: boolean;
  className?: string;
}

export function InjuryRiskPanel({
  snapshot,
  loading = false,
  className,
}: InjuryRiskPanelProps) {
  if (loading && !snapshot) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-slate-400" />
            Injury Risk Prediction
          </CardTitle>
        </CardHeader>
        <div className="flex h-40 items-center justify-center text-sm text-slate-500">
          Waiting for realtime data…
        </div>
      </Card>
    );
  }

  if (!snapshot) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-slate-400" />
            Injury Risk Prediction
          </CardTitle>
        </CardHeader>
        <div className="flex h-40 items-center justify-center text-sm text-slate-500">
          No risk data available for this session.
        </div>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-red-400" />
              Injury Risk Prediction
            </CardTitle>
            <Badge variant="warning">Experimental</Badge>
          </div>
          <div className="flex items-center gap-2">
            <ConfidenceIndicator
              value={snapshot.modelConfidence}
              label={`Confidence: ${snapshot.confidenceLevel}`}
            />
            <ValidationBadge status={snapshot.validationStatus as any} />
          </div>
        </div>
      </CardHeader>

      {/* Mandatory experimental disclaimer */}
      <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-700 bg-amber-950/40 px-4 py-3 text-xs text-amber-400">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{INJURY_RISK_DISCLAIMER}</span>
      </div>

      <div className="space-y-6">
        {/* Overall score */}
        <RiskScore score={snapshot.overallRiskScore} level={snapshot.overallRiskLevel} />

        {/* Articulation radar + table */}
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-slate-400">Per-Articulation Risk Map</p>
            <div className="rounded-xl border border-slate-700 bg-slate-900 p-2">
              <ArticulationRiskChart
                articulationRisks={snapshot.articulationRisks}
                overallRiskLevel={snapshot.overallRiskLevel}
              />
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-400">Joint Breakdown</p>
            <ArticulationTable articulationRisks={snapshot.articulationRisks} />
          </div>
        </div>

        {/* Contributing factors */}
        <div>
          <p className="mb-3 text-sm font-medium text-slate-400">Contributing Factors</p>
          <div className="space-y-4">
            {snapshot.riskFactors.map((f) => (
              <RiskFactorRow key={f.id} factor={f} />
            ))}
          </div>
        </div>

        {/* Signal quality and joint angles note */}
        <div className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-800/40 px-4 py-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            Signal quality: {Math.round(snapshot.signalQualityScore * 100)}%
          </span>
          {snapshot.usedInferredJointAngles && (
            <span className="flex items-center gap-1 text-amber-400">
              <Info className="h-3.5 w-3.5" />
              Inferred joint angles included (experimental)
            </span>
          )}
          {!snapshot.usedInferredJointAngles && (
            <span>Proxy metrics only — no joint angles available</span>
          )}
        </div>
      </div>
    </Card>
  );
}
