'use client';

import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Settings } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Application Settings</CardTitle>
        </CardHeader>
        <div className="space-y-4 text-sm text-slate-600">
          <p>
            Configuration for gateway connection, backend URL, inference mode,
            and display preferences will be managed here.
          </p>
          <dl className="space-y-2">
            <div className="flex justify-between">
              <dt className="text-slate-500">Backend URL</dt>
              <dd className="font-mono text-xs">{process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Gateway URL</dt>
              <dd className="font-mono text-xs">{process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://localhost:3001'}</dd>
            </div>
          </dl>
        </div>
      </Card>
    </div>
  );
}
