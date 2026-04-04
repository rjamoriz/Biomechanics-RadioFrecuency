'use client';

import { Card } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

export default function ReportsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Reports</h1>

      <Card className="py-12 text-center">
        <BarChart3 className="mx-auto h-12 w-12 text-slate-300" />
        <p className="mt-4 text-sm text-slate-500">
          Session reports, trend summaries, and printable PDF exports will appear here.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Reports are generated from completed sessions with persisted metric series.
        </p>
      </Card>
    </div>
  );
}
