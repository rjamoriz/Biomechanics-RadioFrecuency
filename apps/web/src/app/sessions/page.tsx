'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ValidationBadge } from '@/components/ui/validation-badge';
import { useSessions } from '@/hooks/use-sessions';
import { Timer, Plus } from 'lucide-react';
import Link from 'next/link';

interface SessionSummary {
  id: string;
  athleteFirstName: string;
  athleteLastName: string;
  stationName: string;
  status: string;
  validationStatus: string;
  startedAt: string | null;
  completedAt: string | null;
}

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'info'> = {
  COMPLETED: 'success',
  IN_PROGRESS: 'info',
  PAUSED: 'warning',
  CANCELLED: 'danger',
  CREATED: 'default',
  FAILED: 'danger',
};

export default function SessionsPage() {
  const { data: sessions, isLoading } = useSessions();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Sessions</h1>
        <Link
          href="/sessions/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          New Session
        </Link>
      </div>

      {isLoading && (
        <Card className="py-12 text-center">
          <p className="text-sm text-slate-500">Loading sessions...</p>
        </Card>
      )}

      {sessions && sessions.length === 0 && (
        <Card className="py-12 text-center">
          <Timer className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-4 text-sm text-slate-500">No sessions recorded yet.</p>
        </Card>
      )}

      {sessions && sessions.length > 0 && (
        <div className="space-y-3">
          {sessions.map((session) => (
            <Link key={session.id} href={`/sessions/${session.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {session.athleteName}
                    </p>
                    <p className="text-sm text-slate-500">
                      Station: {session.stationName}
                      {session.startedAt &&
                        ` — ${new Date(session.startedAt).toLocaleString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ValidationBadge
                      status={session.validationStatus.toLowerCase().replace(/_/g, '-') as any}
                    />
                    <Badge variant={statusVariant[session.status] ?? 'default'}>
                      {session.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
