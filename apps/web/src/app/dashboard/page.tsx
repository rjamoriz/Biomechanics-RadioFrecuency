'use client';

import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfidenceIndicator } from '@/components/ui/confidence-indicator';
import { SkeletonViewerCard } from '@/components/skeleton-viewer-card';
import { DemoControlPanel } from '@/components/demo-control-panel';
import { ForceAnalysisPanel } from '@/components/force-analysis-panel';
import { useGatewaySocket } from '@/hooks/use-gateway-socket';
import { Activity, Heart, Radio, Timer, Users, Wind } from 'lucide-react';

export default function DashboardPage() {
  const {
    connected,
    demoMode,
    metrics,
    inferredFrame,
    vitalSigns,
    demoState,
    setTreadmill,
    sendDemoControl,
  } = useGatewaySocket();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
        <div className="flex items-center gap-2">
          <Badge variant={connected ? 'success' : 'danger'}>
            {connected ? 'Connected' : 'Disconnected'}
          </Badge>
          {demoMode && <Badge variant="warning">Demo Mode</Badge>}
        </div>
      </div>

      {/* Demo Control Panel (only visible in demo mode) */}
      {demoMode && (
        <DemoControlPanel
          demoState={demoState}
          onDemoControl={sendDemoControl}
          onSetTreadmill={setTreadmill}
        />
      )}

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
              value={`${metrics.estimatedCadence.toFixed(0)} SPM`}
            />
            <MetricTile
              label="Step Interval"
              value={`${metrics.stepIntervalEstimate.toFixed(0)} ms`}
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
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <ConfidenceIndicator value={metrics.metricConfidence} label="Metric Confidence" />
            <ConfidenceIndicator value={metrics.signalQualityScore} label="Signal Quality" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Validation</span>
              <Badge variant={metrics.validationStatus === 'externally_validated' ? 'success' : 'warning'}>
                {metrics.validationStatus}
              </Badge>
            </div>
          </div>
        </Card>
      )}

      {/* Empty state */}
      {!metrics && (
        <Card className="py-12 text-center">
          <Activity className="mx-auto h-12 w-12 text-slate-600" />
          <p className="mt-4 text-sm text-slate-400">
            No live data available. Start a session or enable demo mode.
          </p>
        </Card>
      )}

      {/* Vital signs (experimental) */}
      {vitalSigns && (vitalSigns.breathing || vitalSigns.heartRate) && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Estimated Vital Signs</CardTitle>
              <Badge variant="warning">Experimental</Badge>
            </div>
            <p className="text-xs text-slate-400">
              Proxy metrics from Wi-Fi CSI phase analysis — not clinical-grade measurements.
            </p>
          </CardHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            {vitalSigns.breathing && (
              <div className="flex items-center gap-3 rounded-lg bg-blue-950/50 p-4">
                <Wind className="h-8 w-8 text-blue-500" />
                <div>
                  <p className="text-xs text-blue-400">Estimated Breathing Rate</p>
                  <p className="text-2xl font-bold text-blue-100">
                    {vitalSigns.breathing.estimatedBpm.toFixed(1)} BPM
                  </p>
                  <ConfidenceIndicator
                    value={vitalSigns.breathing.confidence}
                    label="Confidence"
                  />
                </div>
              </div>
            )}
            {vitalSigns.heartRate && (
              <div className="flex items-center gap-3 rounded-lg bg-red-950/50 p-4">
                <Heart className="h-8 w-8 text-red-500" />
                <div>
                  <p className="text-xs text-red-400">Estimated Heart Rate</p>
                  <p className="text-2xl font-bold text-red-100">
                    {vitalSigns.heartRate.estimatedBpm.toFixed(1)} BPM
                  </p>
                  <ConfidenceIndicator
                    value={vitalSigns.heartRate.confidence}
                    label="Confidence"
                  />
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Inferred 3D Skeleton (when inference data is available) */}
      {inferredFrame && (
        <SkeletonViewerCard
          keypoints={
            inferredFrame.keypoints2D?.map((kp) => ({
              x: (kp.x - 0.5) * 2,
              y: (1 - kp.y) * 1.8,
              z: (kp.z ?? 0) * 2,
              confidence: kp.confidence,
            })) ?? null
          }
          modelConfidence={inferredFrame.confidence}
          signalQualityScore={inferredFrame.signalQualityScore}
          validationStatus={
            (inferredFrame.validationStatus as
              | 'unvalidated'
              | 'experimental'
              | 'station-validated'
              | 'externally-validated') ?? 'experimental'
          }
          experimental={inferredFrame.experimental}
        />
      )}

      {/* Estimated Running Forces (experimental proxy) */}
      {inferredFrame?.estimatedForces && (
        <ForceAnalysisPanel forces={inferredFrame.estimatedForces} />
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
        <div className="rounded-lg bg-brand-600/10 p-2">
          <Icon className="h-5 w-5 text-brand-400" />
        </div>
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="text-xl font-semibold text-slate-100">{value}</p>
        </div>
      </div>
    </Card>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-800 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-100">{value}</p>
    </div>
  );
}
