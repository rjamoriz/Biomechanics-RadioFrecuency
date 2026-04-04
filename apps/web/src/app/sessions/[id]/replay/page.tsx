'use client';

import { useParams } from 'next/navigation';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Play } from 'lucide-react';

export default function SessionReplayPage() {
  const params = useParams<{ id: string }>();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Session Replay</h1>

      <Card className="py-12 text-center">
        <Play className="mx-auto h-12 w-12 text-slate-300" />
        <p className="mt-4 text-sm text-slate-500">
          Session replay for session <span className="font-mono">{params.id}</span> will
          display stored metric series, stage transitions, and event timeline here.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Replay playback controls, speed selector, and metric charts will be
          rendered once session data is available from the backend.
        </p>
      </Card>
    </div>
  );
}
