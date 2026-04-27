'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ValidationBadge } from '@/components/ui/validation-badge';
import { apiFetch } from '@/lib/api';
import Link from 'next/link';
import { Activity, Play, Eye, ClipboardCheck, ShieldAlert } from 'lucide-react';

interface SessionDetail {
  id: string;
  status: string;
  validationStatus: string;
  operatorNotes: string | null;
  shoeType: string | null;
  inferredMotionEnabled: boolean;
  startedAt: string | null;
  completedAt: string | null;
}

export default function SessionDetailPage() {
  const params = useParams<{ id: string }>();

  const { data: session, isLoading } = useQuery({
    queryKey: ['sessions', params.id],
    queryFn: () => apiFetch<SessionDetail>(`/sessions/${params.id}`),
    enabled: !!params.id,
  });

  if (isLoading) return <p className="text-sm text-slate-500">Loading session...</p>;
  if (!session) return <p className="text-sm text-slate-500">Session not found.</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Session</h1>
        <div className="flex items-center gap-2">
          <ValidationBadge
            status={session.validationStatus.toLowerCase().replace(/_/g, '-') as any}
          />
          <Badge>{session.status.replace(/_/g, ' ')}</Badge>
        </div>
      </div>

      {/* Action links */}
      <div className="flex gap-3">
        <Link
          href={`/sessions/${params.id}/live`}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Activity className="h-4 w-4" />
          Live View
        </Link>
        <Link
          href={`/sessions/${params.id}/replay`}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Play className="h-4 w-4" />
          Replay
        </Link>
        {session.inferredMotionEnabled && (
          <Link
            href={`/sessions/${params.id}/inferred-motion`}
            className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
          >
            <Eye className="h-4 w-4" />
            Inferred Motion
          </Link>
        )}
        <Link
          href={`/sessions/${params.id}/validation`}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <ClipboardCheck className="h-4 w-4" />
          Validation
        </Link>
        <Link
          href={`/sessions/${params.id}/injury-risk`}
          className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
        >
          <ShieldAlert className="h-4 w-4" />
          Injury Risk
        </Link>
      </div>

      {/* Session info */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <dl className="space-y-3 text-sm">
            <Field label="Status" value={session.status.replace(/_/g, ' ')} />
            <Field label="Started" value={session.startedAt ? new Date(session.startedAt).toLocaleString() : '—'} />
            <Field label="Completed" value={session.completedAt ? new Date(session.completedAt).toLocaleString() : '—'} />
            <Field label="Shoe Type" value={session.shoeType || '—'} />
            <Field
              label="Inferred Motion"
              value={session.inferredMotionEnabled ? 'Enabled' : 'Disabled'}
            />
          </dl>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Operator Notes</CardTitle>
          </CardHeader>
          <p className="text-sm text-slate-600">
            {session.operatorNotes || 'No notes.'}
          </p>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value}</dd>
    </div>
  );
}
