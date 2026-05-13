'use client';

import { useParams } from 'next/navigation';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAthlete } from '@/hooks/use-athletes';
import { Pencil } from 'lucide-react';
import Link from 'next/link';

export default function AthleteDetailPage() {
  const params = useParams<{ id: string }>();
  const { data: athlete, isLoading } = useAthlete(params.id);

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
        <div className="flex items-center gap-2">
          <Link href={`/athletes/${params.id}/longitudinal`}>
            <Button variant="secondary" size="sm">
              Training Timeline
            </Button>
          </Link>
          <Link href={`/athletes/${params.id}/edit`}>
            <Button variant="secondary" size="sm">
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
          </Link>
          <Badge variant={athlete.active ? 'success' : 'default'}>
            {athlete.active ? 'Active' : 'Inactive'}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <dl className="space-y-3 text-sm">
            <Field label="Email" value={athlete.email} />
            <Field label="Sport" value={athlete.sport || '—'} />
            <Field label="Date of Birth" value={athlete.dateOfBirth || '—'} />
            <Field label="Height" value={athlete.heightCm ? `${athlete.heightCm} cm` : '—'} />
            <Field label="Weight" value={athlete.weightKg ? `${athlete.weightKg} kg` : '—'} />
            <Field label="Notes" value={athlete.notes || '—'} />
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
