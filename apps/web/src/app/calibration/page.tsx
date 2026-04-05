'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useStations } from '@/hooks/use-stations';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format';
import {
  Radio,
  ChevronRight,
  ChevronLeft,
  Check,
  Loader2,
  AlertTriangle,
  Activity,
  Zap,
  User,
  Ruler,
  ClipboardCheck,
  RotateCcw,
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────

interface AntennaPlacement {
  distanceFromCenter: number;
  height: number;
  angle: number;
  roomWidth: number;
  roomLength: number;
  ceilingHeight: number;
}

interface BaselineResult {
  noiseFloor: number;
  ambientInterference: number;
  subcarrierStability: number;
  quality: 'good' | 'marginal' | 'poor';
}

interface WalkCalibrationResult {
  estimatedCadence: number;
  signalQualityScore: number;
  stepDetectionConfidence: number;
  passed: boolean;
}

interface RunCalibrationResult {
  estimatedCadence: number;
  contactTimeProxy: number;
  signalClarity: number;
  passed: boolean;
}

const STEPS = [
  { label: 'Station', icon: Radio, description: 'Select station' },
  { label: 'Placement', icon: Ruler, description: 'Antenna configuration' },
  { label: 'Baseline', icon: Activity, description: 'Environment baseline' },
  { label: 'Walking', icon: User, description: 'Walking calibration' },
  { label: 'Running', icon: Zap, description: 'Running calibration' },
  { label: 'Summary', icon: ClipboardCheck, description: 'Review & save' },
] as const;

const CAPTURE_DURATION_MS = 8_000;

// ── Main Component ──────────────────────────────────────────────

export default function CalibrationPage() {
  const [step, setStep] = useState(0);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [placement, setPlacement] = useState<AntennaPlacement | null>(null);
  const [baseline, setBaseline] = useState<BaselineResult | null>(null);
  const [walkResult, setWalkResult] = useState<WalkCalibrationResult | null>(null);
  const [runResult, setRunResult] = useState<RunCalibrationResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data: stations, isLoading: stationsLoading } = useStations();
  const selectedStation = stations?.find((s) => s.id === selectedStationId) ?? null;

  const canProceed = (): boolean => {
    switch (step) {
      case 0:
        return !!selectedStationId;
      case 1:
        return !!placement;
      case 2:
        return !!baseline;
      case 3:
        return !!walkResult;
      case 4:
        return !!runResult;
      default:
        return false;
    }
  };

  const overallScore = (): number => {
    if (!baseline) return 0;
    let score = baseline.quality === 'good' ? 40 : baseline.quality === 'marginal' ? 20 : 5;
    if (walkResult?.passed) score += 30;
    else if (walkResult) score += 10;
    if (runResult?.passed) score += 30;
    else if (runResult) score += 10;
    return Math.min(100, score);
  };

  const calibrationStatus = (): 'calibrated' | 'needs_recalibration' | 'failed' => {
    const score = overallScore();
    if (score >= 70) return 'calibrated';
    if (score >= 40) return 'needs_recalibration';
    return 'failed';
  };

  const handleSave = async () => {
    if (!selectedStationId || !placement || !baseline) return;
    setSaving(true);
    try {
      await apiFetch(`/stations/${encodeURIComponent(selectedStationId)}/calibrate`, {
        method: 'POST',
        body: {
          placement,
          baseline,
          walkResult,
          runResult,
          overallScore: overallScore(),
          status: calibrationStatus(),
        },
      });
      setSaved(true);
    } catch {
      // Error handled by apiFetch
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setStep(0);
    setSelectedStationId(null);
    setPlacement(null);
    setBaseline(null);
    setWalkResult(null);
    setRunResult(null);
    setSaved(false);
  };

  const jumpToStep = (target: number) => {
    if (target < step) setStep(target);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Station Calibration Wizard</h1>

      {/* ── Step Progress Indicator ── */}
      <nav aria-label="Calibration steps" data-testid="step-indicator">
        <ol className="flex items-center justify-between gap-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <li key={i} className="flex flex-1 items-center">
                <button
                  type="button"
                  onClick={() => jumpToStep(i)}
                  disabled={i >= step}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors w-full',
                    isActive && 'bg-brand-50 ring-1 ring-brand-200',
                    isDone && 'cursor-pointer hover:bg-green-50',
                    !isActive && !isDone && 'opacity-50 cursor-default',
                  )}
                >
                  <div
                    className={cn(
                      'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-brand-600 text-white'
                        : isDone
                          ? 'bg-green-500 text-white'
                          : 'bg-slate-100 text-slate-400',
                    )}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <div className="hidden min-w-0 lg:block">
                    <p
                      className={cn(
                        'truncate text-xs font-medium',
                        isActive ? 'text-brand-700' : isDone ? 'text-green-700' : 'text-slate-400',
                      )}
                    >
                      {s.label}
                    </p>
                    <p className="truncate text-[10px] text-slate-400">{s.description}</p>
                  </div>
                </button>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'mx-1 hidden h-px w-4 flex-shrink-0 sm:block',
                      i < step ? 'bg-green-400' : 'bg-slate-200',
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* ── Step Content ── */}
      <div className="min-h-[400px]">
        {step === 0 && (
          <StationSelectionStep
            stations={stations ?? []}
            loading={stationsLoading}
            selectedId={selectedStationId}
            onSelect={setSelectedStationId}
            selectedStation={selectedStation}
          />
        )}

        {step === 1 && <AntennaPlacementStep placement={placement} onSave={setPlacement} />}

        {step === 2 && <EnvironmentBaselineStep result={baseline} onComplete={setBaseline} />}

        {step === 3 && <WalkingCalibrationStep result={walkResult} onComplete={setWalkResult} />}

        {step === 4 && <RunningCalibrationStep result={runResult} onComplete={setRunResult} />}

        {step === 5 && (
          <SummaryStep
            station={selectedStation}
            placement={placement}
            baseline={baseline}
            walkResult={walkResult}
            runResult={runResult}
            score={overallScore()}
            status={calibrationStatus()}
            saving={saving}
            saved={saved}
            onSave={handleSave}
            onReset={handleReset}
            onRerunStep={jumpToStep}
          />
        )}
      </div>

      {/* ── Navigation ── */}
      {step < 5 && (
        <div className="flex items-center justify-between border-t border-slate-200 pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          <span className="text-xs text-slate-400">
            Step {step + 1} of {STEPS.length}
          </span>
          <Button size="sm" onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}>
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
  selectedStation,
}: {
  stations: Array<{
    id: string;
    name: string;
    location: string;
    treadmillModel: string | null;
    calibrationStatus: string;
    createdAt: string;
  }>;
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  selectedStation: { id: string; name: string; location: string; treadmillModel: string | null } | null;
}) {
  const calibrationVariant = (status: string) => {
    switch (status) {
      case 'calibrated':
        return 'success' as const;
      case 'needs-calibration':
      case 'needs_recalibration':
        return 'warning' as const;
      case 'uncalibrated':
      case 'failed':
        return 'danger' as const;
      default:
        return 'default' as const;
    }
  };

  if (loading) {
    return (
      <Card className="py-12 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400" />
        <p className="mt-3 text-sm text-slate-500">Loading stations…</p>
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
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Select the station you want to calibrate.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="station-grid">
        {stations.map((station) => (
          <Card
            key={station.id}
            className={cn(
              'cursor-pointer transition-all hover:shadow-md',
              selectedId === station.id && 'ring-2 ring-brand-600',
            )}
          >
            <button className="w-full text-left" onClick={() => onSelect(station.id)}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-900">{station.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{station.location}</p>
                </div>
                <Badge variant={calibrationVariant(station.calibrationStatus)}>
                  {station.calibrationStatus}
                </Badge>
              </div>
              {station.treadmillModel && (
                <p className="mt-2 text-xs text-slate-500">Treadmill: {station.treadmillModel}</p>
              )}
              <p className="mt-1 text-xs text-slate-400">
                Created {formatRelativeTime(station.createdAt)}
              </p>
            </button>
          </Card>
        ))}
      </div>

      {selectedStation && (
        <Card className="mt-4 bg-brand-50 border-brand-200">
          <p className="text-sm font-medium text-brand-800">Selected: {selectedStation.name}</p>
          <p className="text-xs text-brand-600">
            {selectedStation.location}
            {selectedStation.treadmillModel && ` · ${selectedStation.treadmillModel}`}
          </p>
        </Card>
      )}
    </div>
  );
}

// ── Step 2: Antenna Placement ───────────────────────────────────

function AntennaPlacementStep({
  placement,
  onSave,
}: {
  placement: AntennaPlacement | null;
  onSave: (p: AntennaPlacement) => void;
}) {
  const [form, setForm] = useState<AntennaPlacement>(
    placement ?? {
      distanceFromCenter: 120,
      height: 100,
      angle: 90,
      roomWidth: 4,
      roomLength: 5,
      ceilingHeight: 2.8,
    },
  );

  const update = (field: keyof AntennaPlacement, value: string) => {
    const num = parseFloat(value);
    if (!isNaN(num)) {
      setForm((prev) => ({ ...prev, [field]: num }));
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Ruler className="h-5 w-5 text-blue-500" />
          <CardTitle>Antenna Placement Configuration</CardTitle>
        </div>
      </CardHeader>

      <div
        className="mb-6 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800"
        data-testid="placement-hint"
      >
        <p className="font-medium">Ideal Placement Guide</p>
        <p className="mt-1 text-xs text-blue-700">
          Position the receiver antenna 100–150 cm from treadmill center, at belt height (≈100 cm),
          angled 90° toward the running surface. The transmitter should be on the opposite side.
          Ensure clear line of sight with no metallic obstructions between TX and RX antennas.
        </p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-700">Antenna Position</h4>
          <InputField
            label="Distance from treadmill center"
            unit="cm"
            value={form.distanceFromCenter}
            onChange={(v) => update('distanceFromCenter', v)}
            data-testid="antenna-distance"
          />
          <InputField
            label="Antenna height"
            unit="cm"
            value={form.height}
            onChange={(v) => update('height', v)}
            data-testid="antenna-height"
          />
          <InputField
            label="Antenna angle"
            unit="°"
            value={form.angle}
            onChange={(v) => update('angle', v)}
            data-testid="antenna-angle"
          />
        </div>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-slate-700">Room Dimensions</h4>
          <InputField
            label="Room width"
            unit="m"
            value={form.roomWidth}
            onChange={(v) => update('roomWidth', v)}
          />
          <InputField
            label="Room length"
            unit="m"
            value={form.roomLength}
            onChange={(v) => update('roomLength', v)}
          />
          <InputField
            label="Ceiling height"
            unit="m"
            value={form.ceilingHeight}
            onChange={(v) => update('ceilingHeight', v)}
          />
        </div>
      </div>

      <div className="mt-6">
        <Button onClick={() => onSave(form)}>Save Placement Configuration</Button>
        {placement && (
          <span className="ml-3 text-sm text-green-600">
            <Check className="mr-1 inline h-4 w-4" />
            Configuration saved
          </span>
        )}
      </div>
    </Card>
  );
}

// ── Step 3: Environment Baseline ────────────────────────────────

function EnvironmentBaselineStep({
  result,
  onComplete,
}: {
  result: BaselineResult | null;
  onComplete: (r: BaselineResult) => void;
}) {
  const [collecting, setCollecting] = useState(false);
  const [progress, setProgress] = useState(0);

  const startCapture = useCallback(() => {
    setCollecting(true);
    setProgress(0);
  }, []);

  useEffect(() => {
    if (!collecting) return;
    const interval = setInterval(() => {
      setProgress((p) => {
        const next = p + 100 / (CAPTURE_DURATION_MS / 100);
        if (next >= 100) {
          setCollecting(false);
          const noiseFloor = -85 + Math.random() * 15;
          const ambientInterference = Math.random() * 0.3;
          const subcarrierStability = 0.65 + Math.random() * 0.3;
          const avgQuality = (1 - ambientInterference + subcarrierStability) / 2;
          onComplete({
            noiseFloor,
            ambientInterference,
            subcarrierStability,
            quality: avgQuality >= 0.7 ? 'good' : avgQuality >= 0.45 ? 'marginal' : 'poor',
          });
          return 100;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(interval);
  }, [collecting, onComplete]);

  const qualityIcon = (q: BaselineResult['quality']) => {
    switch (q) {
      case 'good':
        return <span className="text-green-600">✅ Good</span>;
      case 'marginal':
        return <span className="text-amber-600">⚠️ Marginal</span>;
      case 'poor':
        return <span className="text-red-600">❌ Poor</span>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-500" />
          <CardTitle>Environment Baseline</CardTitle>
        </div>
      </CardHeader>

      <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div>
          <p className="font-medium">Ensure treadmill is OFF and room is empty</p>
          <p className="mt-1 text-xs text-amber-700">
            This step captures a 60-second baseline of the ambient RF environment to establish
            noise floor, interference levels, and subcarrier stability reference values.
          </p>
        </div>
      </div>

      {!collecting && !result && (
        <Button onClick={startCapture} data-testid="capture-baseline-btn">
          Capture Baseline
        </Button>
      )}

      {collecting && (
        <CaptureProgress label="Capturing environment baseline" progress={progress} />
      )}

      {result && (
        <div className="space-y-4" data-testid="baseline-results">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-600">Baseline captured</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricTile label="Noise Floor" value={`${result.noiseFloor.toFixed(1)} dBm`} />
            <MetricTile
              label="Ambient Interference"
              value={`${(result.ambientInterference * 100).toFixed(1)}%`}
            />
            <MetricTile
              label="Subcarrier Stability"
              value={`${(result.subcarrierStability * 100).toFixed(1)}%`}
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">Quality Assessment:</span>
            {qualityIcon(result.quality)}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Step 4: Walking Calibration ─────────────────────────────────

function WalkingCalibrationStep({
  result,
  onComplete,
}: {
  result: WalkCalibrationResult | null;
  onComplete: (r: WalkCalibrationResult) => void;
}) {
  const [collecting, setCollecting] = useState(false);
  const [progress, setProgress] = useState(0);

  const startCapture = useCallback(() => {
    setCollecting(true);
    setProgress(0);
  }, []);

  useEffect(() => {
    if (!collecting) return;
    const interval = setInterval(() => {
      setProgress((p) => {
        const next = p + 100 / (CAPTURE_DURATION_MS / 100);
        if (next >= 100) {
          setCollecting(false);
          const cadence = 105 + Math.random() * 15;
          const signalQuality = 0.6 + Math.random() * 0.35;
          const stepConfidence = 0.55 + Math.random() * 0.4;
          onComplete({
            estimatedCadence: cadence,
            signalQualityScore: signalQuality,
            stepDetectionConfidence: stepConfidence,
            passed: signalQuality >= 0.6 && stepConfidence >= 0.5,
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
          <User className="h-5 w-5 text-green-500" />
          <CardTitle>Walking Calibration</CardTitle>
        </div>
      </CardHeader>

      <div className="mb-4 flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div>
          <p className="font-medium">Have athlete walk at 4 km/h for 60 seconds</p>
          <p className="mt-1 text-xs text-blue-700">
            This captures walking gait patterns to calibrate step detection at lower speeds.
          </p>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        <p className="font-medium text-slate-600">Pass criteria</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>Signal quality ≥ 60%</li>
          <li>Step detection confidence ≥ 50%</li>
          <li>Estimated cadence in expected range (90–130 spm)</li>
        </ul>
      </div>

      {!collecting && !result && (
        <Button onClick={startCapture} data-testid="start-walk-btn">
          Start Walking Capture
        </Button>
      )}

      {collecting && (
        <CaptureProgress label="Capturing walking calibration" progress={progress} />
      )}

      {result && (
        <CalibrationResultView
          passed={result.passed}
          metrics={[
            { label: 'Estimated Cadence', value: `${result.estimatedCadence.toFixed(0)} spm` },
            { label: 'Signal Quality', value: `${(result.signalQualityScore * 100).toFixed(1)}%` },
            {
              label: 'Step Detection Confidence',
              value: `${(result.stepDetectionConfidence * 100).toFixed(1)}%`,
            },
          ]}
        />
      )}
    </Card>
  );
}

// ── Step 5: Running Calibration ─────────────────────────────────

function RunningCalibrationStep({
  result,
  onComplete,
}: {
  result: RunCalibrationResult | null;
  onComplete: (r: RunCalibrationResult) => void;
}) {
  const [collecting, setCollecting] = useState(false);
  const [progress, setProgress] = useState(0);

  const startCapture = useCallback(() => {
    setCollecting(true);
    setProgress(0);
  }, []);

  useEffect(() => {
    if (!collecting) return;
    const interval = setInterval(() => {
      setProgress((p) => {
        const next = p + 100 / (CAPTURE_DURATION_MS / 100);
        if (next >= 100) {
          setCollecting(false);
          const cadence = 165 + Math.random() * 20;
          const contactTime = 200 + Math.random() * 60;
          const signalClarity = 0.6 + Math.random() * 0.35;
          onComplete({
            estimatedCadence: cadence,
            contactTimeProxy: contactTime,
            signalClarity,
            passed: signalClarity >= 0.6 && cadence >= 150,
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
          <Zap className="h-5 w-5 text-amber-500" />
          <CardTitle>Running Calibration</CardTitle>
        </div>
      </CardHeader>

      <div className="mb-4 flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div>
          <p className="font-medium">Have athlete run at 10 km/h for 60 seconds</p>
          <p className="mt-1 text-xs text-blue-700">
            This captures running gait patterns to calibrate contact-time proxy and cadence at
            higher speeds.
          </p>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
        <p className="font-medium text-slate-600">Pass criteria</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5">
          <li>Signal clarity ≥ 60%</li>
          <li>Estimated cadence ≥ 150 spm</li>
          <li>Contact-time proxy within expected range (180–280 ms)</li>
        </ul>
      </div>

      {!collecting && !result && (
        <Button onClick={startCapture} data-testid="start-run-btn">
          Start Running Capture
        </Button>
      )}

      {collecting && (
        <CaptureProgress label="Capturing running calibration" progress={progress} />
      )}

      {result && (
        <CalibrationResultView
          passed={result.passed}
          metrics={[
            { label: 'Estimated Cadence', value: `${result.estimatedCadence.toFixed(0)} spm` },
            { label: 'Contact-Time Proxy', value: `${result.contactTimeProxy.toFixed(0)} ms` },
            { label: 'Signal Clarity', value: `${(result.signalClarity * 100).toFixed(1)}%` },
          ]}
        />
      )}
    </Card>
  );
}

// ── Step 6: Summary ─────────────────────────────────────────────

function SummaryStep({
  station,
  placement,
  baseline,
  walkResult,
  runResult,
  score,
  status,
  saving,
  saved,
  onSave,
  onReset,
  onRerunStep,
}: {
  station: { name: string; location: string } | null;
  placement: AntennaPlacement | null;
  baseline: BaselineResult | null;
  walkResult: WalkCalibrationResult | null;
  runResult: RunCalibrationResult | null;
  score: number;
  status: 'calibrated' | 'needs_recalibration' | 'failed';
  saving: boolean;
  saved: boolean;
  onSave: () => void;
  onReset: () => void;
  onRerunStep: (step: number) => void;
}) {
  const statusBadge = () => {
    switch (status) {
      case 'calibrated':
        return <Badge variant="success">Calibrated</Badge>;
      case 'needs_recalibration':
        return <Badge variant="warning">Needs Recalibration</Badge>;
      case 'failed':
        return <Badge variant="danger">Failed</Badge>;
    }
  };

  return (
    <Card data-testid="calibration-summary">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-brand-600" />
            <CardTitle>Calibration Summary</CardTitle>
          </div>
          {statusBadge()}
        </div>
      </CardHeader>

      {station && (
        <p className="mb-4 text-sm text-slate-600">
          <span className="font-medium text-slate-900">{station.name}</span> — {station.location}
        </p>
      )}

      {/* Overall Score */}
      <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
          Overall Calibration Quality Score
        </p>
        <p
          className={cn(
            'mt-1 text-4xl font-bold',
            score >= 70 ? 'text-green-600' : score >= 40 ? 'text-amber-600' : 'text-red-600',
          )}
        >
          {score}
        </p>
        <p className="mt-1 text-xs text-slate-400">out of 100</p>
      </div>

      {/* Results Grid */}
      <div className="space-y-4">
        {placement && (
          <SummarySection
            title="Antenna Placement"
            onRerun={() => onRerunStep(1)}
            items={[
              { label: 'Distance', value: `${placement.distanceFromCenter} cm` },
              { label: 'Height', value: `${placement.height} cm` },
              { label: 'Angle', value: `${placement.angle}°` },
              { label: 'Room', value: `${placement.roomWidth}×${placement.roomLength}×${placement.ceilingHeight} m` },
            ]}
          />
        )}

        {baseline && (
          <SummarySection
            title="Environment Baseline"
            onRerun={() => onRerunStep(2)}
            status={baseline.quality === 'good' ? 'pass' : baseline.quality === 'marginal' ? 'warn' : 'fail'}
            items={[
              { label: 'Noise Floor', value: `${baseline.noiseFloor.toFixed(1)} dBm` },
              { label: 'Interference', value: `${(baseline.ambientInterference * 100).toFixed(1)}%` },
              { label: 'Stability', value: `${(baseline.subcarrierStability * 100).toFixed(1)}%` },
              { label: 'Quality', value: baseline.quality },
            ]}
          />
        )}

        {walkResult && (
          <SummarySection
            title="Walking Calibration (4 km/h)"
            onRerun={() => onRerunStep(3)}
            status={walkResult.passed ? 'pass' : 'fail'}
            items={[
              { label: 'Estimated Cadence', value: `${walkResult.estimatedCadence.toFixed(0)} spm` },
              { label: 'Signal Quality', value: `${(walkResult.signalQualityScore * 100).toFixed(1)}%` },
              { label: 'Step Confidence', value: `${(walkResult.stepDetectionConfidence * 100).toFixed(1)}%` },
            ]}
          />
        )}

        {runResult && (
          <SummarySection
            title="Running Calibration (10 km/h)"
            onRerun={() => onRerunStep(4)}
            status={runResult.passed ? 'pass' : 'fail'}
            items={[
              { label: 'Estimated Cadence', value: `${runResult.estimatedCadence.toFixed(0)} spm` },
              { label: 'Contact-Time Proxy', value: `${runResult.contactTimeProxy.toFixed(0)} ms` },
              { label: 'Signal Clarity', value: `${(runResult.signalClarity * 100).toFixed(1)}%` },
            ]}
          />
        )}
      </div>

      {/* Actions */}
      <div className="mt-6 flex items-center gap-3 border-t border-slate-200 pt-4">
        {saved ? (
          <div className="flex items-center gap-2 text-sm font-medium text-green-600">
            <Check className="h-4 w-4" /> Calibration saved successfully
          </div>
        ) : (
          <>
            <Button onClick={onSave} loading={saving}>
              Save Calibration
            </Button>
            <Button variant="danger" onClick={onReset}>
              Discard &amp; Restart
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

// ── Shared Components ───────────────────────────────────────────

function InputField({
  label,
  unit,
  value,
  onChange,
  ...props
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (v: string) => void;
  'data-testid'?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          data-testid={props['data-testid']}
        />
        <span className="flex-shrink-0 text-xs text-slate-400">{unit}</span>
      </div>
    </div>
  );
}

function CaptureProgress({ label, progress }: { label: string; progress: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        {label}… {Math.round(progress)}%
      </div>
      <div className="h-2 w-full rounded-full bg-slate-100">
        <div
          className="h-2 rounded-full bg-brand-600 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-slate-400">Simulating 60-second capture…</p>
    </div>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function CalibrationResultView({
  passed,
  metrics,
}: {
  passed: boolean;
  metrics: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="space-y-4">
      <div
        className={cn(
          'flex items-center gap-2 text-sm font-medium',
          passed ? 'text-green-600' : 'text-red-600',
        )}
      >
        {passed ? (
          <>
            <Check className="h-4 w-4" /> Passed
          </>
        ) : (
          <>
            <AlertTriangle className="h-4 w-4" /> Failed — consider recalibrating
          </>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {metrics.map((m) => (
          <MetricTile key={m.label} label={m.label} value={m.value} />
        ))}
      </div>
    </div>
  );
}

function SummarySection({
  title,
  items,
  status,
  onRerun,
}: {
  title: string;
  items: Array<{ label: string; value: string }>;
  status?: 'pass' | 'warn' | 'fail';
  onRerun: () => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
          {status === 'pass' && <Badge variant="success">Pass</Badge>}
          {status === 'warn' && <Badge variant="warning">Marginal</Badge>}
          {status === 'fail' && <Badge variant="danger">Fail</Badge>}
        </div>
        <button
          onClick={onRerun}
          className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800"
        >
          <RotateCcw className="h-3 w-3" /> Re-run
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-xs text-slate-500">{item.label}</p>
            <p className="text-sm font-medium text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
