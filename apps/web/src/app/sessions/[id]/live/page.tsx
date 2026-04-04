'use client';

import { useParams } from 'next/navigation';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfidenceIndicator } from '@/components/ui/confidence-indicator';
import { useGatewaySocket } from '@/hooks/use-gateway-socket';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useRef, useState, useEffect } from 'react';

interface DataPoint {
  t: number;
  cadence: number;
  symmetry: number;
  fatigue: number;
}

export default function LiveSessionPage() {
  const params = useParams<{ id: string }>();
  const { connected, demoMode, metrics } = useGatewaySocket();
  const [history, setHistory] = useState<DataPoint[]>([]);
  const maxPoints = 120; // ~2 min at 1 Hz display

  useEffect(() => {
    if (!metrics) return;
    setHistory((prev) => {
      const next = [
        ...prev,
        {
          t: Math.floor((Date.now() % 300_000) / 1000),
          cadence: metrics.estimatedCadence,
          symmetry: metrics.symmetryProxy * 100,
          fatigue: metrics.fatigueDriftScore * 100,
        },
      ];
      return next.length > maxPoints ? next.slice(-maxPoints) : next;
    });
  }, [metrics]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Live Session</h1>
        <div className="flex items-center gap-2">
          <Badge variant={connected ? 'success' : 'danger'}>
            {connected ? 'Live' : 'Offline'}
          </Badge>
          {demoMode && <Badge variant="warning">Demo</Badge>}
        </div>
      </div>

      {/* Real-time metric cards */}
      {metrics ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Estimated Cadence" value={`${metrics.estimatedCadence.toFixed(0)} SPM`} />
            <MetricCard label="Step Interval" value={`${metrics.stepIntervalEstimate.toFixed(0)} ms`} />
            <MetricCard label="Symmetry Proxy" value={`${(metrics.symmetryProxy * 100).toFixed(1)}%`} />
            <MetricCard label="Contact-Time Proxy" value={`${(metrics.contactTimeProxy * 100).toFixed(1)}%`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <ConfidenceIndicator value={metrics.metricConfidence} label="Metric Confidence" />
            <ConfidenceIndicator value={metrics.signalQualityScore} label="Signal Quality" />
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Validation</span>
              <Badge variant={metrics.validationStatus === 'externally_validated' ? 'success' : 'warning'}>
                {metrics.validationStatus}
              </Badge>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Cadence Trend</CardTitle>
            </CardHeader>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="t" label={{ value: 'Time (s)', position: 'bottom' }} />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="cadence" stroke="#2563eb" dot={false} name="Cadence (SPM)" />
                  <Line type="monotone" dataKey="symmetry" stroke="#22c55e" dot={false} name="Symmetry (%)" />
                  <Line type="monotone" dataKey="fatigue" stroke="#f59e0b" dot={false} name="Fatigue (%)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Treadmill state */}
          <Card>
            <CardHeader>
              <CardTitle>Treadmill</CardTitle>
            </CardHeader>
            <div className="flex gap-8 text-sm">
              <div>
                <span className="text-slate-500">Speed: </span>
                <span className="font-semibold">{metrics.speedKmh.toFixed(1)} km/h</span>
              </div>
              <div>
                <span className="text-slate-500">Incline: </span>
                <span className="font-semibold">{metrics.inclinePercent.toFixed(1)}%</span>
              </div>
            </div>
          </Card>
        </>
      ) : (
        <Card className="py-12 text-center">
          <p className="text-sm text-slate-500">
            Waiting for live data from the gateway...
          </p>
        </Card>
      )}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
    </Card>
  );
}
