'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useStation } from '@/hooks/use-stations';
import { useCalibrationActive, useCalibrations, useCreateCalibration } from '@/hooks/use-calibration';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, Loader2, ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';

const STEPS = [
  {
    id: 1,
    title: 'Environment Baseline',
    description:
      'Capture the ambient Wi-Fi signal with no person present on the treadmill.',
    instructions: [
      'Ensure no person is standing on or near the treadmill belt.',
      'Clear any large objects (bags, equipment) within 2 m of the station.',
      'Keep the treadmill belt stopped.',
      'Wait at least 10 seconds before continuing.',
    ],
  },
  {
    id: 2,
    title: 'Treadmill Baseline',
    description:
      'Capture the treadmill mechanical signature with the belt running and no athlete.',
    instructions: [
      'Start the treadmill belt at minimum speed (1–2 km/h).',
      'Ensure no person is on or near the belt.',
      'Let the treadmill run undisturbed for at least 30 seconds.',
      'Proceed once the belt is running steadily.',
    ],
  },
  {
    id: 3,
    title: 'Confirm & Save',
    description:
      'Review your calibration settings and save. A valid calibration expires after 30 days.',
    instructions: [],
  },
];

type Step = 1 | 2 | 3;

export default function CalibratePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const stationId = params.id;

  const { data: station, isLoading: stationLoading } = useStation(stationId);
  const { data: isActive } = useCalibrationActive(stationId);
  const { data: history } = useCalibrations(stationId);
  const createCalibration = useCreateCalibration();

  const [step, setStep] = useState<Step>(1);
  const [notes, setNotes] = useState('');
  const [signalQualityScore, setSignalQualityScore] = useState<number>(0.8);

  const latest = history?.[0];

  function handleNext() {
    if (step < 3) setStep((s) => (s + 1) as Step);
  }

  function handleBack() {
    if (step > 1) setStep((s) => (s - 1) as Step);
  }

  async function handleComplete() {
    try {
      await createCalibration.mutateAsync({
        stationId,
        status: 'CALIBRATED',
        signalQualityScore,
        notes: notes.trim() || undefined,
      });
      router.push(`/stations/${stationId}`);
    } catch {
      // error shown via mutation state
    }
  }

  if (stationLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading station…
      </div>
    );
  }

  if (!station) {
    return <p className="text-sm text-slate-500">Station not found.</p>;
  }

  const currentStep = STEPS[step - 1];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/stations/${stationId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Calibrate Station
          </h1>
          <p className="text-sm text-slate-500">{station.name}</p>
        </div>
        {isActive && (
          <Badge className="ml-auto bg-emerald-100 text-emerald-800">
            Currently Calibrated
          </Badge>
        )}
      </div>

      {/* Current status card */}
      {latest && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
            Last calibration
          </p>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="text-slate-700">
              {new Date(latest.createdAt).toLocaleString()}
            </span>
            <CalibrationStatusBadge status={latest.status} />
          </div>
          {latest.expiresAt && (
            <p className="mt-1 text-xs text-slate-400">
              Expires {new Date(latest.expiresAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {/* Step progress */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, idx) => (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
                step > s.id
                  ? 'bg-emerald-500 text-white'
                  : step === s.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-500'
              }`}
            >
              {step > s.id ? <CheckCircle2 className="h-4 w-4" /> : s.id}
            </div>
            <span
              className={`text-sm ${step === s.id ? 'font-medium text-slate-900' : 'text-slate-400'}`}
            >
              {s.title}
            </span>
            {idx < STEPS.length - 1 && (
              <div className="mx-2 h-px w-8 bg-slate-200" />
            )}
          </div>
        ))}
      </div>

      {/* Step card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{currentStep.title}</CardTitle>
          <p className="text-sm text-slate-500">{currentStep.description}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentStep.instructions.length > 0 && (
            <ol className="space-y-2">
              {currentStep.instructions.map((inst, i) => (
                <li key={i} className="flex gap-3 text-sm text-slate-700">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                    {i + 1}
                  </span>
                  {inst}
                </li>
              ))}
            </ol>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {/* Signal quality slider */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Signal Quality Score
                  <span className="ml-2 text-slate-400">
                    ({Math.round(signalQualityScore * 100)}%)
                  </span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={signalQualityScore}
                  onChange={(e) =>
                    setSignalQualityScore(parseFloat(e.target.value))
                  }
                  className="w-full accent-blue-600"
                />
                <p className="text-xs text-slate-400">
                  Estimated signal clarity observed during baseline capture.
                </p>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="e.g. Treadmill model X, room temperature 22°C, no interference sources…"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Disclaimer */}
              <div className="flex gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <p className="text-xs text-amber-800">
                  Calibration profiles expire after 30 days. Recalibrate if the
                  treadmill is moved, the environment changes significantly, or
                  signal quality degrades below acceptable thresholds.
                </p>
              </div>
            </div>
          )}

          {createCalibration.isError && (
            <p className="text-sm text-red-600">
              Failed to save calibration. Please try again.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button
          variant="secondary"
          onClick={handleBack}
          disabled={step === 1}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        {step < 3 ? (
          <Button onClick={handleNext}>
            Next
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            onClick={handleComplete}
            disabled={createCalibration.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {createCalibration.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Complete Calibration
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

function CalibrationStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    CALIBRATED: 'bg-emerald-100 text-emerald-800',
    IN_PROGRESS: 'bg-blue-100 text-blue-800',
    NOT_CALIBRATED: 'bg-slate-100 text-slate-600',
    EXPIRED: 'bg-amber-100 text-amber-800',
  };
  return (
    <Badge className={map[status] ?? 'bg-slate-100 text-slate-600'}>
      {status.replace(/_/g, ' ')}
    </Badge>
  );
}
