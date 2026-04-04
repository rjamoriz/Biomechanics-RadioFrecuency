'use client';

import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfidenceIndicator } from '@/components/ui/confidence-indicator';
import { useGatewaySocket } from '@/hooks/use-gateway-socket';
import { Activity, Radio, Timer, Users } from 'lucide-react';

export default function DashboardPage() {
  const { connected, demoMode, metrics } = useGatewaySocket();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <div className="flex items-center gap-2">
          <Badge variant={connected ? 'success' : 'danger'}>
            {connected ? 'Connected' : 'Disconnected'}
          </Badge>
          {demoMode && <Badge variant="warning">Demo Mode</Badge>}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <QuickStat icon={Users} label="Athletes" value="—" />
        <QuickStat icon={Radio} label="Stations" value="—" />
        <QuickStat icon={Timer} label="Sessions Today" value="—" />
        <QuickStat icon={Activity} label="Active Now" value={connected ? '1' : '0'} />
      </div>

      {/* Live metrics (when connected) */}
      {metrics && (
        <Card>
          <CardHeader>
            <CardTitle>Live Metrics</CardTitle>
          </CardHeader>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricTile
              label="Estimated Cadence"
              value={`${metrics.estimatedCadenceSpm.toFixed(0)} SPM`}
            />
            <MetricTile
              label="Step Interval"
              value={`${metrics.stepIntervalMs.toFixed(0)} ms`}
            />
            <MetricTile
              label="Symmetry Proxy"
              value={`${(metrics.symmetryProxy * 100).toFixed(1)}%`}
            />
            <MetricTile
              label="Fatigue Drift"
              value={`${(metrics.fatigueDriftScore * 100).toFixed(1)}%`}
            />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <ConfidenceIndicator value={metrics.metricConfidence} label="Metric Confidence" />
            <ConfidenceIndicator value={metrics.signalQualityScore} label="Signal Quality" />
          </div>
        </Card>
      )}

      {/* Empty state */}
      {!metrics && (
        <Card className="py-12 text-center">
          <Activity className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-4 text-sm text-slate-500">
            No live data available. Start a session or enable demo mode.
          </p>
        </Card>
      )}
    </div>
  );
}

function QuickStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-brand-50 p-2">
          <Icon className="h-5 w-5 text-brand-600" />
        </div>
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-xl font-semibold text-slate-900">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
