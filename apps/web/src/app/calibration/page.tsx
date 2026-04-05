'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfidenceIndicator } from '@/components/ui/confidence-indicator';
import { useStations } from '@/hooks/use-stations';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format';
import {
  Crosshair,
  Radio,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  AlertTriangle,
  Activity,
  Zap,
  User,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────

interface BaselineResult {
  signalQualityScore: number;
  noiseFloor: number;
  packetRate: number;
}

interface CalibrationSummary {
  environmentQuality: number;
  treadmillInterference: number;
  stationConfidence: number;
}

const STEPS = [
  { label: 'Station', icon: Radio },
  { label: 'Environment', icon: Activity },
  { label: 'Treadmill', icon: Zap },
  { label: 'Reference Run', icon: User },
  { label: 'Confirmation', icon: Check },
] as const;

const BASELINE_DURATION_MS = 10_000;

// ── Main Component ──────────────────────────────────────────────

export default function CalibrationPage() {
  const [step, setStep] = useState(0);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [envBaseline, setEnvBaseline] = useState<BaselineResult | null>(null);
  const [treadmillBaseline, setTreadmillBaseline] = useState<BaselineResult | null>(null);
  const [refRunDone, setRefRunDone] = useState(false);
  const [refRunSkipped, setRefRunSkipped] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: stations, isLoading: stationsLoading } = useStations();

  const selectedStation = stations?.find((s) => s.id === selectedStationId) ?? null;

  const canProceed = (): boolean => {
    switch (step) {
      case 0:
        return !!selectedStationId;
      case 1:
        return !!envBaseline;
      case 2:
        return !!treadmillBaseline;
      case 3:
        return refRunDone || refRunSkipped;
      default:
        return false;
    }
  };

  const handleSave = async () => {
    if (!selectedStationId) return;
    setSaving(true);
    try {
      await apiFetch(`/stations/${encodeURIComponent(selectedStationId)}/calibrate`, {
        method: 'POST',
        body: { envBaseline, treadmillBaseline, refRunDone },
      });
      setSaved(true);
    } catch {
      // Error handled by apiFetch
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setStep(0);
    setSelectedStationId(null);
    setEnvBaseline(null);
    setTreadmillBaseline(null);
    setRefRunDone(false);
    setRefRunSkipped(false);
    setSaved(false);
  };

  const summary: CalibrationSummary | null =
    envBaseline && treadmillBaseline
      ? {
          environmentQuality: envBaseline.signalQualityScore,
          treadmillInterference: Math.max(
            0,
            1 - Math.abs(envBaseline.signalQualityScore - treadmillBaseline.signalQualityScore),
          ),
          stationConfidence:
            (envBaseline.signalQualityScore + treadmillBaseline.signalQualityScore) / 2,
        }
      : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Station Calibration</h1>

      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isDone = i < step;
          return (
            <div key={i} className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-brand-600 text-white'
                    : isDone
                      ? 'bg-green-500 text-white'
                      : 'bg-slate-100 text-slate-400',
                )}
              >
                {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <span
                className={cn(
                  'hidden text-xs font-medium sm:inline',
                  isActive ? 'text-slate-900' : 'text-slate-400',
                )}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    'h-px w-8',
                    i < step ? 'bg-green-500' : 'bg-slate-200',
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Step Content */}
      {step === 0 && (
        <StationSelectionStep
          stations={stations ?? []}
          loading={stationsLoading}
          selectedId={selectedStationId}
          onSelect={(id) => setSelectedStationId(id)}
        />
      )}

      {step === 1 && (
        <BaselineCollectionStep
          title="Environment Baseline"
          instructions="Please ensure the treadmill is OFF and nobody is near the station."
          icon={<Activity className="h-5 w-5 text-blue-500" />}
          result={envBaseline}
          onComplete={setEnvBaseline}
        />
      )}

      {step === 2 && (
        <BaselineCollectionStep
          title="Treadmill Baseline"
          instructions="Turn on the treadmill at low speed (3 km/h) with nobody running."
          icon={<Zap className="h-5 w-5 text-amber-500" />}
          result={treadmillBaseline}
          onComplete={setTreadmillBaseline}
          comparison={envBaseline}
        />
      )}

      {step === 3 && (
        <ReferenceRunStep
          done={refRunDone}
          skipped={refRunSkipped}
          onStart={() => setRefRunDone(true)}
          onSkip={() => setRefRunSkipped(true)}
        />
      )}

      {step === 4 && summary && (
        <ConfirmationStep
          station={selectedStation}
          summary={summary}
          saving={saving}
          saved={saved}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      )}

      {/* Navigation */}
      {step < 4 && (
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <Button
            size="sm"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canProceed()}
          >
            Next <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Step 1: Station Selection ───────────────────────────────────

function StationSelectionStep({
  stations,
  loading,
  selectedId,
  onSelect,
}: {
  stations: Array<{
    id: string;
    name: string;
    location: string;
    calibrationStatus: string;
    createdAt: string;
  }>;
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const calibrationVariant = (status: string) => {
    switch (status) {
      case 'calibrated':
        return 'success' as const;
      case 'needs-calibration':
        return 'warning' as const;
      case 'uncalibrated':
        return 'danger' as const;
      default:
        return 'default' as const;
    }
  };

  if (loading) {
    return (
      <Card className="py-12 text-center">
        <p className="text-sm text-slate-500">Loading stations...</p>
      </Card>
    );
  }

  if (stations.length === 0) {
    return (
      <Card className="py-12 text-center">
        <Radio className="mx-auto h-12 w-12 text-slate-300" />
        <p className="mt-4 text-sm text-slate-500">No stations available for calibration.</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {stations.map((station) => (
        <Card
          key={station.id}
          className={cn(
            'cursor-pointer transition-all hover:shadow-md',
            selectedId === station.id && 'ring-2 ring-brand-600',
          )}
        >
          <button
            className="w-full text-left"
            onClick={() => onSelect(station.id)}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-slate-900">{station.name}</p>
                <p className="mt-1 text-sm text-slate-500">{station.location}</p>
              </div>
              <Badge variant={calibrationVariant(station.calibrationStatus)}>
                {station.calibrationStatus}
              </Badge>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Created {formatRelativeTime(station.createdAt)}
            </p>
          </button>
        </Card>
      ))}
    </div>
  );
}

// ── Steps 2 & 3: Baseline Collection ────────────────────────────

function BaselineCollectionStep({
  title,
  instructions,
  icon,
  result,
  onComplete,
  comparison,
}: {
  title: string;
  instructions: string;
  icon: React.ReactNode;
  result: BaselineResult | null;
  onComplete: (r: BaselineResult) => void;
  comparison?: BaselineResult | null;
}) {
  const [collecting, setCollecting] = useState(false);
  const [progress, setProgress] = useState(0);

  const startCollection = useCallback(() => {
    setCollecting(true);
    setProgress(0);
  }, []);

  useEffect(() => {
    if (!collecting) return;
    const interval = setInterval(() => {
      setProgress((p) => {
        const next = p + 100 / (BASELINE_DURATION_MS / 100);
        if (next >= 100) {
          setCollecting(false);
          onComplete({
            signalQualityScore: 0.75 + Math.random() * 0.2,
            noiseFloor: -80 + Math.random() * 10,
            packetRate: 900 + Math.random() * 100,
          });
          return 100;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [collecting, onComplete]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle>{title}</CardTitle>
        </div>
      </CardHeader>

      <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <p>{instructions}</p>
      </div>

      <div className="mt-4">
        {!collecting && !result && (
          <Button onClick={startCollection}>Start Baseline Collection</Button>
        )}

        {collecting && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Collecting baseline... {Math.round(progress)}%
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-brand-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-green-600">
              <Check className="h-4 w-4" /> Baseline captured
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-xs text-slate-500">Signal Quality</p>
                <ConfidenceIndicator value={result.signalQualityScore} label="Quality" />
              </div>
              <div>
                <p className="text-xs text-slate-500">Noise Floor</p>
                <p className="text-sm font-medium text-slate-900">
                  {result.noiseFloor.toFixed(1)} dBm
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Packet Rate</p>
                <p className="text-sm font-medium text-slate-900">
                  {result.packetRate.toFixed(0)} pps
                </p>
              </div>
            </div>

            {comparison && (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-600 mb-2">
                  Comparison with Environment Baseline
                </p>
                <div className="grid gap-2 sm:grid-cols-2 text-xs">
                  <div>
                    <span className="text-slate-500">Quality Diff: </span>
                    <span className="font-medium">
                      {((result.signalQualityScore - comparison.signalQualityScore) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Noise Diff: </span>
                    <span className="font-medium">
                      {(result.noiseFloor - comparison.noiseFloor).toFixed(1)} dBm
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Step 4: Reference Run ───────────────────────────────────────

function ReferenceRunStep({
  done,
  skipped,
  onStart,
  onSkip,
}: {
  done: boolean;
  skipped: boolean;
  onStart: () => void;
  onSkip: () => void;
}) {
  const [collecting, setCollecting] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleStart = useCallback(() => {
    setCollecting(true);
    setProgress(0);
  }, []);

  useEffect(() => {
    if (!collecting) return;
    const interval = setInterval(() => {
      setProgress((p) => {
        const next = p + 100 / 300; // 30 seconds
        if (next >= 100) {
          setCollecting(false);
          onStart();
          return 100;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [collecting, onStart]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <User className="h-5 w-5 text-green-500" />
          <CardTitle>Reference Run (Optional)</CardTitle>
        </div>
      </CardHeader>

      <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <p>Optionally have a reference athlete run for 30 seconds at steady pace.</p>
      </div>

      <div className="mt-4">
        {!collecting && !done && !skipped && (
          <div className="flex items-center gap-3">
            <Button onClick={handleStart}>Start Reference Run</Button>
            <Button variant="ghost" onClick={onSkip}>
              Skip
            </Button>
          </div>
        )}

        {collecting && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Collecting reference run... {Math.round(progress)}%
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100">
              <div
                className="h-2 rounded-full bg-green-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-slate-400">
              Live metrics preview would appear here during collection.
            </p>
          </div>
        )}

        {done && (
          <div className="flex items-center gap-2 text-sm font-medium text-green-600">
            <Check className="h-4 w-4" /> Reference run captured
          </div>
        )}

        {skipped && (
          <p className="text-sm text-slate-500">Reference run skipped.</p>
        )}
      </div>
    </Card>
  );
}

// ── Step 5: Confirmation ────────────────────────────────────────

function ConfirmationStep({
  station,
  summary,
  saving,
  saved,
  onSave,
  onDiscard,
}: {
  station: { id: string; name: string; location: string } | null;
  summary: CalibrationSummary;
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Calibration Summary</CardTitle>
      </CardHeader>

      {station && (
        <div className="mb-4 text-sm text-slate-600">
          <p>
            <span className="font-medium text-slate-900">{station.name}</span> —{' '}
            {station.location}
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs text-slate-500 mb-1">Environment Quality</p>
          <ConfidenceIndicator value={summary.environmentQuality} label="Quality" />
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Treadmill Interference</p>
          <ConfidenceIndicator value={summary.treadmillInterference} label="Interference" />
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-1">Station Calibration Confidence</p>
          <ConfidenceIndicator value={summary.stationConfidence} label="Confidence" />
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        {saved ? (
          <div className="flex items-center gap-2 text-sm font-medium text-green-600">
            <Check className="h-4 w-4" /> Calibration saved successfully
          </div>
        ) : (
          <>
            <Button onClick={onSave} loading={saving}>
              Save Calibration
            </Button>
            <Button variant="danger" onClick={onDiscard}>
              Discard
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
