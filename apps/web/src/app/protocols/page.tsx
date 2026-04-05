'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useProtocols } from '@/hooks/use-protocols';
import { formatDuration, formatSpeed, formatIncline } from '@/lib/format';
import { ListChecks, Plus } from 'lucide-react';
import Link from 'next/link';

export default function ProtocolsPage() {
  const { data: protocols, isLoading } = useProtocols();

  const totalDuration = (stages: Array<{ durationSeconds: number }>) =>
    stages.reduce((sum, s) => sum + s.durationSeconds, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Protocols</h1>
        <Link
          href="/protocols/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          New Protocol
        </Link>
      </div>

      {isLoading && (
        <Card className="py-12 text-center">
          <p className="text-sm text-slate-500">Loading protocols...</p>
        </Card>
      )}

      {protocols && protocols.length === 0 && (
        <Card className="py-12 text-center">
          <ListChecks className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-4 text-sm text-slate-500">
            No protocols configured yet.
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Create multi-stage treadmill protocols for standardized assessments.
          </p>
        </Card>
      )}

      {protocols && protocols.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {protocols.map((protocol) => (
            <Card key={protocol.id} className="transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{protocol.name}</p>
                  {protocol.description && (
                    <p className="mt-1 text-sm text-slate-500 line-clamp-2">
                      {protocol.description}
                    </p>
                  )}
                </div>
                <Badge variant="outline">
                  {protocol.stages.length} stage{protocol.stages.length !== 1 && 's'}
                </Badge>
              </div>
              <div className="mt-3 flex gap-3 text-xs text-slate-500">
                <span>Total: {formatDuration(totalDuration(protocol.stages))}</span>
                <span>
                  Speed: {formatSpeed(Math.min(...protocol.stages.map((s) => s.speedKmh)))} –{' '}
                  {formatSpeed(Math.max(...protocol.stages.map((s) => s.speedKmh)))}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
