'use client';

import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
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
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Brain,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────

interface AccuracyMetrics {
  cadenceMae: number;
  strideRmse: number;
  symmetryError: number;
}

interface ConfidenceDistribution {
  highPercent: number;
  mediumPercent: number;
  lowPercent: number;
}

interface StationPerformance {
  stationId: string;
  stationName: string;
  samplesCount: number;
  cadenceMae: number;
  strideRmse: number;
  overallConfidence: number;
  health: 'healthy' | 'degraded' | 'needs-retraining';
}

interface ModelPerformanceData {
  modelVersion: string;
  lastTrainedAt: string;
  validationStatus: string;
  accuracy: AccuracyMetrics;
  confidenceDistribution: ConfidenceDistribution;
  stations: StationPerformance[];
  health: 'healthy' | 'degraded' | 'needs-retraining';
}

// ── Helpers ─────────────────────────────────────────────────────

function healthVariant(health: string): 'success' | 'warning' | 'danger' {
  if (health === 'healthy') return 'success';
  if (health === 'degraded') return 'warning';
  return 'danger';
}

function healthIcon(health: string) {
  if (health === 'healthy') return <CheckCircle2 className="h-5 w-5 text-green-600" />;
  if (health === 'degraded') return <AlertTriangle className="h-5 w-5 text-amber-600" />;
  return <XCircle className="h-5 w-5 text-red-600" />;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ── Main Component ──────────────────────────────────────────────

export default function ModelPerformancePage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['model-performance'],
    queryFn: () => apiFetch<ModelPerformanceData>('/model/performance'),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Model Performance</h1>
        <div className="py-12 text-center" data-testid="loading-state">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400" />
          <p className="mt-2 text-sm text-slate-500">Loading model performance data…</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="text-2xl font-bold text-slate-900">Model Performance</h1>
        <Card>
          <div className="py-8 text-center" data-testid="error-state">
            <XCircle className="mx-auto h-8 w-8 text-red-400" />
            <p className="mt-2 text-sm text-slate-600">
              Failed to load model performance data. Please try again later.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const chartData = [
    { band: 'High', percent: data.confidenceDistribution.highPercent, fill: '#22c55e' },
    { band: 'Medium', percent: data.confidenceDistribution.mediumPercent, fill: '#f59e0b' },
    { band: 'Low', percent: data.confidenceDistribution.lowPercent, fill: '#ef4444' },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Model Performance</h1>

      {/* Estimation Warning */}
      <div
        className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4"
        data-testid="estimation-warning"
      >
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <p className="text-sm text-amber-800">
          Model metrics are estimated. See validation workflow for external reference comparison.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Model Health Card */}
        <div data-testid="model-health">
        <Card>
          <CardHeader>
            <CardTitle>Model Health</CardTitle>
          </CardHeader>
          <div className="flex items-center gap-3">
            {healthIcon(data.health)}
            <Badge variant={healthVariant(data.health)}>
              {data.health === 'needs-retraining' ? 'Needs Retraining' : data.health.charAt(0).toUpperCase() + data.health.slice(1)}
            </Badge>
          </div>
          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <div className="flex justify-between">
              <span>Model Version</span>
              <span className="font-medium text-slate-900" data-testid="model-version">
                {data.modelVersion}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Last Trained</span>
              <span className="font-medium text-slate-900">{formatDate(data.lastTrainedAt)}</span>
            </div>
            <div className="flex justify-between">
              <span>Validation Status</span>
              <Badge variant="info">{data.validationStatus}</Badge>
            </div>
          </div>
        </Card>
        </div>

        {/* Accuracy Metrics Card */}
        <Card>
          <CardHeader>
            <CardTitle>Accuracy Metrics</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" />
                <span className="text-sm text-slate-700">Cadence MAE</span>
              </div>
              <span className="font-mono text-sm font-semibold text-slate-900">
                {data.accuracy.cadenceMae.toFixed(2)} spm
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-500" />
                <span className="text-sm text-slate-700">Stride RMSE</span>
              </div>
              <span className="font-mono text-sm font-semibold text-slate-900">
                {data.accuracy.strideRmse.toFixed(3)} m
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-amber-500" />
                <span className="text-sm text-slate-700">Symmetry Error</span>
              </div>
              <span className="font-mono text-sm font-semibold text-slate-900">
                {(data.accuracy.symmetryError * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Confidence Distribution Chart */}
      <div data-testid="confidence-chart">
      <Card>
        <CardHeader>
          <CardTitle>Confidence Distribution</CardTitle>
        </CardHeader>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="band" />
              <YAxis unit="%" />
              <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
              <Bar dataKey="percent" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      </div>

      {/* Per-Station Performance Table */}
      <div data-testid="station-table">
      <Card>
        <CardHeader>
          <CardTitle>Per-Station Performance</CardTitle>
        </CardHeader>
        {data.stations.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">No station data available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wider text-slate-500">
                  <th className="pb-3 pr-4">Station</th>
                  <th className="pb-3 pr-4">Samples</th>
                  <th className="pb-3 pr-4">Cadence MAE</th>
                  <th className="pb-3 pr-4">Stride RMSE</th>
                  <th className="pb-3 pr-4">Confidence</th>
                  <th className="pb-3">Health</th>
                </tr>
              </thead>
              <tbody>
                {data.stations.map((station) => (
                  <tr key={station.stationId} className="border-b border-slate-100">
                    <td className="py-3 pr-4 font-medium text-slate-900">{station.stationName}</td>
                    <td className="py-3 pr-4 text-slate-600">{station.samplesCount}</td>
                    <td className="py-3 pr-4 font-mono text-slate-700">
                      {station.cadenceMae.toFixed(2)}
                    </td>
                    <td className="py-3 pr-4 font-mono text-slate-700">
                      {station.strideRmse.toFixed(3)}
                    </td>
                    <td className="py-3 pr-4">
                      <ConfidenceIndicator value={station.overallConfidence} showBar={false} />
                    </td>
                    <td className="py-3">
                      <Badge variant={healthVariant(station.health)}>
                        {station.health === 'needs-retraining'
                          ? 'Needs Retraining'
                          : station.health.charAt(0).toUpperCase() + station.health.slice(1)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      </div>
    </div>
  );
}
