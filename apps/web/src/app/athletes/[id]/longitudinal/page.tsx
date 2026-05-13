'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfidenceIndicator } from '@/components/ui/confidence-indicator';
import {
  useTrainingLoads,
  usePainReports,
  useAthleteBaselines,
  useInjuryRiskByAthlete,
} from '@/hooks/use-longitudinal';
import { useAthlete } from '@/hooks/use-athletes';
import type { TrainingLoad, PainReport, AthleteBaseline, InjuryRiskSummary } from '@/types/longitudinal';

// ─── ACWR risk-zone helpers ───────────────────────────────────────────────────

function acwrLabel(acwr: number): { label: string; variant: 'success' | 'warning' | 'destructive' | 'default' } {
  if (acwr < 0.8) return { label: 'Undertraining', variant: 'default' };
  if (acwr <= 1.3) return { label: 'Optimal', variant: 'success' };
  if (acwr <= 1.5) return { label: 'Caution', variant: 'warning' };
  return { label: 'High Risk', variant: 'destructive' };
}

function riskLevelVariant(level: string): 'success' | 'warning' | 'destructive' | 'default' {
  switch (level.toLowerCase()) {
    case 'low': return 'success';
    case 'moderate': return 'warning';
    case 'high': return 'destructive';
    default: return 'default';
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AcwrChart({ loads }: { loads: TrainingLoad[] }) {
  const data = [...loads]
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
    .map((l) => ({
      date: l.sessionDate.slice(5), // MM-DD
      acwr: Number(l.acwr.toFixed(3)),
      acute: Number(l.acuteLoad.toFixed(1)),
      chronic: Number(l.chronicLoad.toFixed(1)),
    }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-slate-700">
          Acute:Chronic Workload Ratio (ACWR)
        </CardTitle>
        <p className="text-xs text-slate-500">
          Estimated proxy metric derived from session load data.
          Not a validated clinical tool.
        </p>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} domain={[0, 2.5]} />
            <Tooltip
              contentStyle={{ fontSize: 12 }}
              formatter={(v: number, name: string) => [v.toFixed(3), name]}
            />
            <Legend iconType="line" wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine y={1.5} stroke="#ef4444" strokeDasharray="4 2" label={{ value: 'High risk', fontSize: 10, fill: '#ef4444', position: 'right' }} />
            <ReferenceLine y={1.3} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: 'Caution', fontSize: 10, fill: '#f59e0b', position: 'right' }} />
            <ReferenceLine y={0.8} stroke="#94a3b8" strokeDasharray="4 2" label={{ value: 'Under', fontSize: 10, fill: '#94a3b8', position: 'right' }} />
            <Line type="monotone" dataKey="acwr" stroke="#6366f1" strokeWidth={2} dot={false} name="ACWR" />
            <Line type="monotone" dataKey="acute" stroke="#22c55e" strokeWidth={1.5} dot={false} name="Acute load" />
            <Line type="monotone" dataKey="chronic" stroke="#64748b" strokeWidth={1.5} dot={false} strokeDasharray="5 3" name="Chronic load" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

function PainTimeline({ reports }: { reports: PainReport[] }) {
  const sorted = [...reports].sort(
    (a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold text-slate-700">Pain Reports</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400">No pain reports recorded.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-slate-700">Pain Reports</CardTitle>
        <p className="text-xs text-slate-500">
          Self-reported pain entries. Not a clinical assessment.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {sorted.map((r) => (
            <li key={r.id} className="flex items-start gap-3 text-sm border-b border-slate-100 pb-2 last:border-0">
              <div className="flex flex-col min-w-[72px]">
                <span className="font-medium text-slate-700">
                  {new Date(r.reportedAt).toLocaleDateString()}
                </span>
                <span className="text-xs text-slate-400">
                  {new Date(r.reportedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="flex-1">
                <span className="font-medium text-slate-800 capitalize">{r.bodyRegion}</span>
                {r.notes && <p className="text-xs text-slate-500 mt-0.5">{r.notes}</p>}
              </div>
              <Badge
                variant={r.painScale >= 7 ? 'destructive' : r.painScale >= 4 ? 'warning' : 'default'}
                className="ml-auto shrink-0"
              >
                {r.painScale}/10
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function BaselinesTable({ baselines }: { baselines: AthleteBaseline[] }) {
  if (baselines.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold text-slate-700">Personal Baselines</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400">No baselines computed yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-slate-700">Personal Baselines</CardTitle>
        <p className="text-xs text-slate-500">
          Rolling means computed from historical session data. Proxy metrics — not validated clinical values.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-1 pr-4 font-semibold text-slate-600">Metric</th>
                <th className="py-1 pr-4 font-semibold text-slate-600 text-right">Mean</th>
                <th className="py-1 pr-4 font-semibold text-slate-600 text-right">±SD</th>
                <th className="py-1 pr-4 font-semibold text-slate-600 text-right">Samples</th>
                <th className="py-1 font-semibold text-slate-600 text-right">Window</th>
              </tr>
            </thead>
            <tbody>
              {baselines.map((b) => (
                <tr key={b.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-1 pr-4 font-medium text-slate-700 capitalize">
                    {b.metricName.replace(/_/g, ' ')}
                  </td>
                  <td className="py-1 pr-4 text-right text-slate-800">
                    {b.baselineMean.toFixed(3)}
                  </td>
                  <td className="py-1 pr-4 text-right text-slate-500">
                    {b.baselineStd.toFixed(3)}
                  </td>
                  <td className="py-1 pr-4 text-right text-slate-500">{b.sampleCount}</td>
                  <td className="py-1 text-right text-slate-400">{b.windowDays}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function InjuryRiskHistory({ summaries }: { summaries: InjuryRiskSummary[] }) {
  const sorted = [...summaries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  if (sorted.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-sm font-semibold text-slate-700">Injury Risk History</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-slate-400">No injury risk summaries available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-slate-700">Injury Risk History</CardTitle>
        <p className="text-xs text-slate-500">
          Estimated risk scores derived from Wi-Fi sensing and gait proxy metrics.
          Experimental — not a clinical assessment. Do not use for diagnosis.
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {sorted.slice(0, 10).map((s) => (
            <li key={s.id} className="flex items-start gap-3 text-sm border-b border-slate-100 pb-3 last:border-0">
              <div className="flex flex-col min-w-[80px]">
                <span className="text-xs text-slate-500">
                  {new Date(s.createdAt).toLocaleDateString()}
                </span>
                <Link
                  href={`/sessions/${s.sessionId}`}
                  className="text-xs text-indigo-600 hover:underline mt-0.5"
                >
                  View session
                </Link>
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant={riskLevelVariant(s.peakRiskLevel)}>
                    {s.peakRiskLevel} — {(s.peakRiskScore * 100).toFixed(1)}%
                  </Badge>
                  {s.experimental && (
                    <span className="text-[10px] text-amber-600 font-medium uppercase tracking-wide">
                      Experimental
                    </span>
                  )}
                </div>
                {s.dominantRiskFactors.length > 0 && (
                  <p className="text-xs text-slate-500">
                    Factors: {s.dominantRiskFactors.join(', ')}
                  </p>
                )}
              </div>
              <ConfidenceIndicator value={s.modelConfidence} />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AthleteLongitudinalPage() {
  const params = useParams<{ id: string }>();
  const athleteId = params.id;

  const { data: athlete, isLoading: athleteLoading } = useAthlete(athleteId);
  const { data: loads = [], isLoading: loadsLoading } = useTrainingLoads(athleteId);
  const { data: painReports = [], isLoading: painLoading } = usePainReports(athleteId, 90);
  const { data: baselines = [], isLoading: baselinesLoading } = useAthleteBaselines(athleteId);
  const { data: riskSummaries = [], isLoading: riskLoading } = useInjuryRiskByAthlete(athleteId);

  const isLoading = athleteLoading || loadsLoading || painLoading || baselinesLoading || riskLoading;

  const latestLoad = loads.length > 0
    ? [...loads].sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))[0]
    : null;

  if (isLoading) {
    return <p className="text-sm text-slate-500 py-8">Loading longitudinal data…</p>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Link href="/athletes" className="hover:underline">Athletes</Link>
            <span>/</span>
            <Link href={`/athletes/${athleteId}`} className="hover:underline">
              {athlete ? `${athlete.firstName} ${athlete.lastName}` : athleteId}
            </Link>
            <span>/</span>
            <span className="text-slate-600">Longitudinal</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Training & Risk Timeline</h1>
        </div>
        <Link
          href={`/athletes/${athleteId}`}
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          ← Back to profile
        </Link>
      </div>

      {/* ACWR summary strip */}
      {latestLoad && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'ACWR', value: latestLoad.acwr.toFixed(3), zone: acwrLabel(latestLoad.acwr) },
            { label: 'Acute load', value: latestLoad.acuteLoad.toFixed(1), zone: null },
            { label: 'Chronic load', value: latestLoad.chronicLoad.toFixed(1), zone: null },
            { label: 'Strain', value: latestLoad.strain.toFixed(1), zone: null },
          ].map(({ label, value, zone }) => (
            <Card key={label} className="p-3">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="text-xl font-bold text-slate-900 mt-0.5">{value}</p>
              {zone && (
                <Badge variant={zone.variant} className="mt-1 text-[10px]">
                  {zone.label}
                </Badge>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ACWR chart */}
      {loads.length > 0 ? (
        <AcwrChart loads={loads} />
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-slate-400">
            No training load data available yet.
          </CardContent>
        </Card>
      )}

      {/* Two-column grid for baselines + pain */}
      <div className="grid gap-6 lg:grid-cols-2">
        <BaselinesTable baselines={baselines} />
        <PainTimeline reports={painReports} />
      </div>

      {/* Injury risk history */}
      <InjuryRiskHistory summaries={riskSummaries} />

      {/* Scientific disclaimer */}
      <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-3">
        All metrics on this page are derived proxy estimates inferred from Wi-Fi CSI sensing.
        They are not validated clinical measurements and must not be used as a basis for medical decisions.
        Consult a qualified clinician or sports physiotherapist for any health concerns.
      </p>
    </div>
  );
}
