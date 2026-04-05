'use client';

import { useParams } from 'next/navigation';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ConfidenceIndicator } from '@/components/ui/confidence-indicator';
import { SessionControls } from '@/components/session-controls';
import { SessionEventLogger } from '@/components/session-event-logger';
import { useGatewaySocket } from '@/hooks/use-gateway-socket';
import { useSession } from '@/hooks/use-sessions';
import { apiFetch } from '@/lib/api';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, AlertCircle } from 'lucide-react';

interface DataPoint {
  t: number;
  cadence: number;
  symmetry: number;
  fatigue: number;
}

export default function LiveSessionPage() {
  const params = useParams<{ id: string }>();
  const { connected, demoMode, metrics } = useGatewaySocket();
  const { data: session } = useSession(params.id);
  const [history, setHistory] = useState<DataPoint[]>([]);
  const [notes, setNotes] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const maxPoints = 120; // ~2 min at 1 Hz display

  // Sync notes from session data
  useEffect(() => {
    if (session?.operatorNotes) setNotes(session.operatorNotes);
  }, [session?.operatorNotes]);

  const saveNotes = useCallback(async () => {
    if (!params.id) return;
    setNotesSaving(true);
    try {
      await apiFetch(`/sessions/${encodeURIComponent(params.id)}/notes`, {
        method: 'PUT',
        body: { notes },
      });
    } finally {
      setNotesSaving(false);
    }
  }, [params.id, notes]);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Live Session</h1>
        <div className="flex items-center gap-3">
          {session && (
            <SessionControls
              sessionId={params.id}
              status={session.status}
              startedAt={session.startedAt}
            />
          )}
          <Badge variant={connected ? 'success' : 'danger'}>
            {connected ? 'Live' : 'Offline'}
          </Badge>
          {demoMode && <Badge variant="warning">Demo</Badge>}
        </div>
      </div>

      {/* Alert cards */}
      {metrics && metrics.signalQualityScore < 0.3 && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
          <p className="text-sm text-red-700">
            <span className="font-semibold">Low signal quality</span> — Signal quality is{' '}
            {(metrics.signalQualityScore * 100).toFixed(0)}%. Estimated metrics may be unreliable.
          </p>
        </div>
      )}
      {metrics && metrics.metricConfidence < 0.5 && metrics.signalQualityScore >= 0.3 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" />
          <p className="text-sm text-amber-700">
            <span className="font-semibold">Low metric confidence</span> — Confidence is{' '}
            {(metrics.metricConfidence * 100).toFixed(0)}%. Interpret proxy metrics with caution.
          </p>
        </div>
      )}

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

          {/* Manual event logger */}
          <Card>
            <SessionEventLogger sessionId={params.id} />
          </Card>

          {/* Operator notes */}
          <Card>
            <CardHeader>
              <CardTitle>Operator Notes</CardTitle>
            </CardHeader>
            <Textarea
              label=""
              placeholder="Type freeform notes during the session..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              rows={3}
            />
            {notesSaving && (
              <p className="mt-1 text-xs text-slate-400">Saving...</p>
            )}
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
