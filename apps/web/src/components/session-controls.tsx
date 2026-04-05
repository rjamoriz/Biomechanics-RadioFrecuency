'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { apiFetch } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import { Pause, Play, Square } from 'lucide-react';

interface SessionControlsProps {
  sessionId: string;
  status: string;
  startedAt: string | null;
}

const statusBadgeVariant = (s: string) => {
  switch (s) {
    case 'running': return 'success' as const;
    case 'paused': return 'warning' as const;
    case 'completed': return 'default' as const;
    default: return 'outline' as const;
  }
};

export function SessionControls({ sessionId, status: initialStatus, startedAt }: SessionControlsProps) {
  const [status, setStatus] = useState(initialStatus);
  const [elapsed, setElapsed] = useState(0);
  const [updating, setUpdating] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep status in sync with prop
  useEffect(() => setStatus(initialStatus), [initialStatus]);

  // Elapsed timer ticking every second when running
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);

    if (status === 'running' && startedAt) {
      const start = new Date(startedAt).getTime();
      const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
      tick();
      timerRef.current = setInterval(tick, 1000);
    }

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status, startedAt]);

  const updateStatus = useCallback(async (newStatus: string) => {
    setUpdating(true);
    try {
      await apiFetch(`/sessions/${encodeURIComponent(sessionId)}/status`, {
        method: 'PUT',
        body: { status: newStatus },
      });
      setStatus(newStatus);
    } finally {
      setUpdating(false);
    }
  }, [sessionId]);

  const completed = status === 'completed';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Badge variant={statusBadgeVariant(status)} className="capitalize">
        {status}
      </Badge>

      {startedAt && (
        <span className="text-sm tabular-nums text-slate-600">
          {formatDuration(elapsed)}
        </span>
      )}

      {!completed && (
        <>
          {status === 'running' ? (
            <Button size="sm" variant="secondary" loading={updating} onClick={() => updateStatus('paused')}>
              <Pause className="h-4 w-4" /> Pause
            </Button>
          ) : status === 'paused' ? (
            <Button size="sm" variant="primary" loading={updating} onClick={() => updateStatus('running')}>
              <Play className="h-4 w-4" /> Resume
            </Button>
          ) : null}

          <Button size="sm" variant="danger" onClick={() => setShowEndConfirm(true)}>
            <Square className="h-4 w-4" /> End Session
          </Button>
        </>
      )}

      <Dialog open={showEndConfirm} onClose={() => setShowEndConfirm(false)} title="End Session?">
        <p className="text-sm text-slate-600">
          This will mark the session as completed. Live data streaming will stop. This action cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="secondary" size="sm" onClick={() => setShowEndConfirm(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            size="sm"
            loading={updating}
            onClick={async () => {
              await updateStatus('completed');
              setShowEndConfirm(false);
            }}
          >
            End Session
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
