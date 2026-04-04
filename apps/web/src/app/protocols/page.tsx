'use client';

import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { ListChecks } from 'lucide-react';

export default function ProtocolsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Protocols</h1>

      <Card className="py-12 text-center">
        <ListChecks className="mx-auto h-12 w-12 text-slate-300" />
        <p className="mt-4 text-sm text-slate-500">
          Treadmill protocol templates with multi-stage speed and incline configurations.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Create and manage assessment protocols for different athlete populations.
        </p>
      </Card>
    </div>
  );
}
