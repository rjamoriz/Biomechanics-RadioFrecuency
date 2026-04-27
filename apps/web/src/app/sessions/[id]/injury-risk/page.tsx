'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, Activity, BarChart2, ListChecks, Wifi } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/ui/tabs';
import { ValidationBadge } from '@/components/ui/validation-badge';
import { ConfidenceIndicator } from '@/components/ui/confidence-indicator';
import { ArticulationRiskChart } from '@/components/articulation-risk-chart';
import { InjuryRiskPanel } from '@/components/injury-risk-panel';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  useInjuryRiskLive,
  useInjuryRiskHistory,
  useWorstInjuryRisk,
  buildRiskTrend,
} from '@/hooks/use-injury-risk';
import {
  RISK_LEVEL_COLORS,
  RISK_LEVEL_FILL,
  JOINT_LABELS,
  INJURY_RISK_DISCLAIMER,
} from '@/types/injury-risk';
import type { InjuryRiskLevel } from '@/types/injury-risk';

const TABS = [
  { id: 'realtime', label: 'Realtime' },
  { id: 'assessment', label: 'Session Assessment' },
  { id: 'articulations', label: 'Articulations' },
  { id: 'factors', label: 'Contributing Factors' },
];

const JOINT_COLORS: Record<string, string> = {
  knee_left:   '#22d3ee',
  knee_right:  '#06b6d4',
  hip_left:    '#a78bfa',
  hip_right:   '#8b5cf6',
  ankle_left:  '#34d399',
  ankle_right: '#10b981',
  lumbar:      '#fb923c',
};

export default function InjuryRiskPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const [activeTab, setActiveTab] = useState('realtime');

  const { latest, history, isConnected } = useInjuryRiskLive({ sessionId });
  const { data: assessments, isLoading: historyLoading } = useInjuryRiskHistory(sessionId);
  const { data: worst } = useWorstInjuryRisk(sessionId);

  const trendData = buildRiskTrend(history);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/sessions/${sessionId}`}
            className="text-slate-400 hover:text-slate-200"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Injury Risk Prediction</h1>
            <p className="text-sm text-slate-400">
              Wi-Fi CSI proxy estimate — not a clinical assessment
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={isConnected ? 'success' : 'warning'}>
            <Wifi className="mr-1 h-3 w-3" />
            {isConnected ? 'Live' : 'Disconnected'}
          </Badge>
          <Badge variant="warning">Experimental</Badge>
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 rounded-lg border border-amber-700 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p>{INJURY_RISK_DISCLAIMER}</p>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={TABS}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* ── Realtime tab ─────────────────────────────────────────── */}
      {activeTab === 'realtime' && (
        <div className="space-y-6">
          <InjuryRiskPanel snapshot={latest} loading={!latest} />

          {trendData.length > 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Risk Score Over Time</CardTitle>
              </CardHeader>
              <div className="pb-4 pr-4">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="timestamp"
                      tickFormatter={(v) => new Date(v).toLocaleTimeString()}
                      tick={{ fill: '#64748b', fontSize: 11 }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fill: '#64748b', fontSize: 11 }}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}
                      labelFormatter={(v) => new Date(v as number).toLocaleTimeString()}
                      formatter={(v: number) => [`${Math.round(v)}%`, '']}
                    />
                    <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="4 4" label={{ value: 'High', fill: '#ef4444', fontSize: 11 }} />
                    <ReferenceLine y={50} stroke="#f97316" strokeDasharray="4 4" label={{ value: 'Elevated', fill: '#f97316', fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey={(d) => Math.round(d.overallRiskScore * 100)}
                      name="Overall"
                      stroke="#f87171"
                      strokeWidth={2.5}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── Assessment tab ────────────────────────────────────────── */}
      {activeTab === 'assessment' && (
        <div className="space-y-4">
          {historyLoading && (
            <p className="text-sm text-slate-400">Loading session assessments…</p>
          )}
          {!historyLoading && (!assessments || assessments.length === 0) && (
            <Card>
              <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                No saved injury risk assessments for this session.
              </div>
            </Card>
          )}
          {worst && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base text-slate-200">Peak Risk Assessment</CardTitle>
                  <ValidationBadge status={worst.validationStatus as any} />
                </div>
              </CardHeader>
              <div className="grid gap-4 sm:grid-cols-3 pb-4 px-4">
                <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 text-center">
                  <p className="text-xs text-slate-400">Peak Score</p>
                  <p className={`mt-1 text-3xl font-bold ${RISK_LEVEL_COLORS[worst.peakRiskLevel as InjuryRiskLevel]}`}>
                    {Math.round(worst.peakRiskScore * 100)}%
                  </p>
                  <p className="mt-0.5 text-xs capitalize text-slate-400">{worst.peakRiskLevel}</p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 text-center">
                  <p className="text-xs text-slate-400">Mean Score</p>
                  <p className="mt-1 text-3xl font-bold text-slate-200">
                    {Math.round(worst.meanRiskScore * 100)}%
                  </p>
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-800 p-4 text-center">
                  <p className="text-xs text-slate-400">Snapshots</p>
                  <p className="mt-1 text-3xl font-bold text-slate-200">
                    {worst.snapshotCount}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">confidence {Math.round(worst.modelConfidence * 100)}%</p>
                </div>
              </div>
            </Card>
          )}
          {assessments && assessments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base text-slate-200">All Assessments</CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-left">
                      <th className="px-4 py-2 font-medium text-slate-400">Saved</th>
                      <th className="px-4 py-2 font-medium text-slate-400">Peak</th>
                      <th className="px-4 py-2 font-medium text-slate-400">Mean</th>
                      <th className="px-4 py-2 font-medium text-slate-400">Level</th>
                      <th className="px-4 py-2 font-medium text-slate-400">Snapshots</th>
                      <th className="px-4 py-2 font-medium text-slate-400">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assessments.map((a) => (
                      <tr key={a.id} className="border-b border-slate-700/50 last:border-0">
                        <td className="px-4 py-2 text-slate-400">
                          {new Date(a.createdAt).toLocaleString()}
                        </td>
                        <td className={`px-4 py-2 font-semibold ${RISK_LEVEL_COLORS[a.peakRiskLevel as InjuryRiskLevel]}`}>
                          {Math.round(a.peakRiskScore * 100)}%
                        </td>
                        <td className="px-4 py-2 text-slate-300">
                          {Math.round(a.meanRiskScore * 100)}%
                        </td>
                        <td className={`px-4 py-2 capitalize ${RISK_LEVEL_COLORS[a.peakRiskLevel as InjuryRiskLevel]}`}>
                          {a.peakRiskLevel}
                        </td>
                        <td className="px-4 py-2 text-slate-400">{a.snapshotCount}</td>
                        <td className="px-4 py-2 text-slate-400">
                          {Math.round(a.modelConfidence * 100)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── Articulations tab ────────────────────────────────────── */}
      {activeTab === 'articulations' && (
        <div className="space-y-4">
          {!latest && (
            <Card>
              <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                Waiting for realtime data to populate articulation map…
              </div>
            </Card>
          )}
          {latest && (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base text-slate-200">Per-Articulation Risk Map</CardTitle>
                    <ConfidenceIndicator
                      value={latest.modelConfidence}
                      label={`Confidence: ${latest.confidenceLevel}`}
                    />
                  </div>
                </CardHeader>
                <div className="pb-4 px-4">
                  <ArticulationRiskChart
                    articulationRisks={latest.articulationRisks}
                    overallRiskLevel={latest.overallRiskLevel}
                    className="py-2"
                  />
                </div>
              </Card>

              {trendData.length > 2 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base text-slate-200">Joint Risk Trends</CardTitle>
                  </CardHeader>
                  <div className="pb-4 pr-4">
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={trendData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis
                          dataKey="timestamp"
                          tickFormatter={(v) => new Date(v).toLocaleTimeString()}
                          tick={{ fill: '#64748b', fontSize: 11 }}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fill: '#64748b', fontSize: 11 }}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155' }}
                          formatter={(v: number) => [`${Math.round(v)}%`, '']}
                        />
                        {Object.keys(JOINT_LABELS).map((joint) => (
                          <Line
                            key={joint}
                            type="monotone"
                            dataKey={(d) => d[joint as keyof typeof d] !== undefined ? Math.round((d[joint as keyof typeof d] as number) * 100) : undefined}
                            name={JOINT_LABELS[joint as keyof typeof JOINT_LABELS]}
                            stroke={JOINT_COLORS[joint] ?? '#94a3b8'}
                            strokeWidth={1.5}
                            dot={false}
                            connectNulls={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Factors tab ──────────────────────────────────────────── */}
      {activeTab === 'factors' && (
        <div className="space-y-4">
          {!latest && (
            <Card>
              <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                Waiting for realtime data…
              </div>
            </Card>
          )}
          {latest && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base text-slate-200">Contributing Risk Factors</CardTitle>
                  <span className="text-xs text-slate-500">
                    {latest.riskFactors.filter((f) => f.elevated).length} elevated
                  </span>
                </div>
              </CardHeader>
              <div className="space-y-5 pb-4 px-4">
                {latest.riskFactors.map((factor) => (
                  <div key={factor.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className={`font-medium ${factor.elevated ? 'text-red-400' : 'text-slate-300'}`}>
                        {factor.elevated && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                        {factor.label}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-500">weight {Math.round(factor.weight * 100)}%</span>
                        <span className={`font-semibold tabular-nums ${factor.elevated ? 'text-red-400' : 'text-slate-400'}`}>
                          {Math.round(factor.value * 100)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${factor.elevated ? 'bg-red-500' : 'bg-emerald-500'}`}
                        style={{ width: `${Math.round(factor.value * 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500">{factor.description}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
