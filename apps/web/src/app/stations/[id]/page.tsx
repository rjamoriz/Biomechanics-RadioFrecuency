'use client';

import { useParams } from 'next/navigation';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useStation } from '@/hooks/use-stations';
import { Pencil } from 'lucide-react';
import Link from 'next/link';

export default function StationDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: station, isLoading } = useStation(params.id);

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading station...</p>;
  }
  if (!station) {
    return <p className="text-sm text-slate-500">Station not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">{station.name}</h1>
        <div className="flex items-center gap-2">
          <Link href={`/stations/${params.id}/edit`}>
            <Button variant="secondary" size="sm">
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </Link>
          <Badge variant={station.active ? 'success' : 'default'}>
            {station.active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Station Info</CardTitle>
          </CardHeader>
          <dl className="space-y-3 text-sm">
            <Field label="Location" value={station.location} />
            <Field label="Treadmill Model" value={station.treadmillModel || '—'} />
            <Field label="Calibration Status" value={station.calibrationStatus.replace(/_/g, ' ')} />
          </dl>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hardware</CardTitle>
          </CardHeader>
          <dl className="space-y-3 text-sm">
            <Field label="Receiver MAC" value={station.rxMac || '—'} />
            <Field label="Transmitter MAC" value={station.txMac || '—'} />
          </dl>
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
