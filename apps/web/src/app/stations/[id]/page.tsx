'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface StationDetail {
  id: string;
  name: string;
  location: string;
  description: string;
  receiverMac: string;
  transmitterMac: string;
  calibrationStatus: string;
  active: boolean;
}

export default function StationDetailPage() {
  const params = useParams<{ id: string }>();

  const { data: station, isLoading } = useQuery({
    queryKey: ['stations', params.id],
    queryFn: () => apiFetch<StationDetail>(`/stations/${params.id}`),
    enabled: !!params.id,
  });

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
        <Badge variant={station.active ? 'success' : 'default'}>
          {station.active ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Station Info</CardTitle>
          </CardHeader>
          <dl className="space-y-3 text-sm">
            <Field label="Location" value={station.location} />
            <Field label="Description" value={station.description || '—'} />
            <Field label="Calibration Status" value={station.calibrationStatus.replace(/_/g, ' ')} />
          </dl>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hardware</CardTitle>
          </CardHeader>
          <dl className="space-y-3 text-sm">
            <Field label="Receiver MAC" value={station.receiverMac || '—'} />
            <Field label="Transmitter MAC" value={station.transmitterMac || '—'} />
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
