'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useStations } from '@/hooks/use-stations';
import { Radio, Plus } from 'lucide-react';
import Link from 'next/link';

const calibrationVariant: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  CALIBRATED: 'success',
  NEEDS_RECALIBRATION: 'warning',
  EXPIRED: 'danger',
  UNCALIBRATED: 'default',
  IN_PROGRESS: 'info' as 'default',
};

export default function StationsPage() {
  const { data: stations, isLoading } = useStations();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Stations</h1>
        <Link
          href="/stations/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          Add Station
        </Link>
      </div>

      {isLoading && (
        <Card className="py-12 text-center">
          <p className="text-sm text-slate-500">Loading stations...</p>
        </Card>
      )}

      {stations && stations.length === 0 && (
        <Card className="py-12 text-center">
          <Radio className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-4 text-sm text-slate-500">No stations configured yet.</p>
        </Card>
      )}

      {stations && stations.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {stations.map((station) => (
            <Link key={station.id} href={`/stations/${station.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">{station.name}</p>
                    <p className="mt-1 text-sm text-slate-500">{station.location}</p>
                  </div>
                  <Badge variant={calibrationVariant[station.calibrationStatus] ?? 'default'}>
                    {station.calibrationStatus.replace(/_/g, ' ')}
                  </Badge>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
