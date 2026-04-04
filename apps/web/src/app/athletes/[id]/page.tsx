'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';

interface AthleteDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  sport: string;
  birthYear: number | null;
  heightCm: number | null;
  weightKg: number | null;
  shoeNotes: string | null;
  notes: string | null;
  active: boolean;
}

export default function AthleteDetailPage() {
  const params = useParams<{ id: string }>();

  const { data: athlete, isLoading } = useQuery({
    queryKey: ['athletes', params.id],
    queryFn: () => apiFetch<AthleteDetail>(`/athletes/${params.id}`),
    enabled: !!params.id,
  });

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading athlete...</p>;
  }

  if (!athlete) {
    return <p className="text-sm text-slate-500">Athlete not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">
          {athlete.firstName} {athlete.lastName}
        </h1>
        <Badge variant={athlete.active ? 'success' : 'default'}>
          {athlete.active ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <dl className="space-y-3 text-sm">
            <Field label="Email" value={athlete.email} />
            <Field label="Sport" value={athlete.sport || '—'} />
            <Field label="Birth Year" value={athlete.birthYear?.toString() || '—'} />
            <Field label="Height" value={athlete.heightCm ? `${athlete.heightCm} cm` : '—'} />
            <Field label="Weight" value={athlete.weightKg ? `${athlete.weightKg} kg` : '—'} />
            <Field label="Shoe Notes" value={athlete.shoeNotes || '—'} />
          </dl>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <p className="text-sm text-slate-600">
            {athlete.notes || 'No notes recorded.'}
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
