'use client';

import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Crosshair } from 'lucide-react';

export default function CalibrationPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Calibration</h1>

      <Card className="py-12 text-center">
        <Crosshair className="mx-auto h-12 w-12 text-slate-300" />
        <p className="mt-4 text-sm text-slate-500">
          Station calibration workflows: environment baseline, treadmill baseline,
          and athlete baseline collection will be managed here.
        </p>
        <p className="mt-2 text-xs text-slate-400">
          Select a station to start or review its calibration profile.
        </p>
      </Card>
    </div>
  );
}
