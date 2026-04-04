'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { apiFetch } from '@/lib/api';
import { Users, Plus } from 'lucide-react';
import Link from 'next/link';

interface Athlete {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  sport: string;
  active: boolean;
}

export default function AthletesPage() {
  const { data: athletes, isLoading } = useQuery({
    queryKey: ['athletes'],
    queryFn: () => apiFetch<Athlete[]>('/athletes'),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Athletes</h1>
        <Link
          href="/athletes/new"
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" />
          Add Athlete
        </Link>
      </div>

      {isLoading && (
        <Card className="py-12 text-center">
          <p className="text-sm text-slate-500">Loading athletes...</p>
        </Card>
      )}

      {athletes && athletes.length === 0 && (
        <Card className="py-12 text-center">
          <Users className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-4 text-sm text-slate-500">
            No athletes registered yet.
          </p>
        </Card>
      )}

      {athletes && athletes.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {athletes.map((athlete) => (
            <Link key={athlete.id} href={`/athletes/${athlete.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {athlete.firstName} {athlete.lastName}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{athlete.email}</p>
                    {athlete.sport && (
                      <p className="mt-1 text-xs text-slate-400">{athlete.sport}</p>
                    )}
                  </div>
                  <Badge variant={athlete.active ? 'success' : 'default'}>
                    {athlete.active ? 'Active' : 'Inactive'}
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
