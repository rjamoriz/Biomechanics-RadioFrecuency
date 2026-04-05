'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useProtocol } from '@/hooks/use-protocols';
import { formatDuration, formatSpeed, formatIncline, formatTimestamp } from '@/lib/format';
import { ArrowLeft, Clock, Gauge, TrendingUp } from 'lucide-react';

export default function ProtocolDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: protocol, isLoading } = useProtocol(params.id);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Link href="/protocols" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to Protocols
        </Link>
        <Card className="py-12 text-center">
          <p className="text-sm text-slate-500">Loading protocol...</p>
        </Card>
      </div>
    );
  }

  if (!protocol) {
    return (
      <div className="space-y-6">
        <Link href="/protocols" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="h-4 w-4" /> Back to Protocols
        </Link>
        <Card className="py-12 text-center">
          <p className="text-sm font-medium text-slate-700">Protocol not found</p>
          <p className="mt-1 text-xs text-slate-400">
            The protocol may have been deleted or never existed.
          </p>
        </Card>
      </div>
    );
  }

  const totalDurationSeconds = protocol.stages.reduce((sum, s) => sum + s.durationSeconds, 0);
  const sortedStages = [...protocol.stages].sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <div className="space-y-6">
      <Link href="/protocols" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> Back to Protocols
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{protocol.name}</h1>
        {protocol.description && (
          <p className="mt-2 text-sm text-slate-500">{protocol.description}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            Total: {formatDuration(totalDurationSeconds)}
          </span>
          <Badge variant="outline">
            {protocol.stages.length} stage{protocol.stages.length !== 1 && 's'}
          </Badge>
          <span>Created {formatTimestamp(protocol.createdAt)}</span>
        </div>
      </div>

      {/* Visual timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Stage Timeline</CardTitle>
        </CardHeader>
        <div className="flex h-10 w-full overflow-hidden rounded-lg">
          {sortedStages.map((stage, i) => {
            const widthPercent = totalDurationSeconds > 0
              ? (stage.durationSeconds / totalDurationSeconds) * 100
              : 100 / sortedStages.length;
            const hue = (i * 360) / Math.max(sortedStages.length, 1);
            return (
              <div
                key={i}
                className="flex items-center justify-center text-xs font-medium text-white"
                style={{
                  width: `${widthPercent}%`,
                  backgroundColor: `hsl(${hue}, 55%, 50%)`,
                  minWidth: '2rem',
                }}
                title={`${stage.name} — ${formatDuration(stage.durationSeconds)}`}
              >
                {widthPercent > 12 ? stage.name : ''}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate-400">
          <span>0:00</span>
          <span>{formatDuration(totalDurationSeconds)}</span>
        </div>
      </Card>

      {/* Stages table */}
      <Card>
        <CardHeader>
          <CardTitle>Stages</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase text-slate-500">
                <th className="pb-2 pr-4">#</th>
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Duration</th>
                <th className="pb-2 pr-4">
                  <span className="inline-flex items-center gap-1"><Gauge className="h-3 w-3" /> Speed</span>
                </th>
                <th className="pb-2">
                  <span className="inline-flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Incline</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedStages.map((stage, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 pr-4 text-slate-400">{stage.orderIndex + 1}</td>
                  <td className="py-3 pr-4 font-medium text-slate-900">{stage.name}</td>
                  <td className="py-3 pr-4 text-slate-600">{formatDuration(stage.durationSeconds)}</td>
                  <td className="py-3 pr-4 text-slate-600">{formatSpeed(stage.speedKmh)}</td>
                  <td className="py-3 text-slate-600">{formatIncline(stage.inclinePercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
