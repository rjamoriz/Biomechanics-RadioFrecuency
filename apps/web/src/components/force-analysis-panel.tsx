'use client';

import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Zap } from 'lucide-react';

interface EstimatedForces {
  groundReactionForceN: number;
  brakingForceN: number;
  propulsiveForceN: number;
  impactLoadingRateNPerS: number;
  muscleForcesN: {
    quadricepsPeak: number;
    hamstringsPeak: number;
    gastrocnemiusPeak: number;
    gluteMaxPeak: number;
    tibialisAnteriorPeak: number;
  };
  runnerWeightN: number;
  speedKmh: number;
  disclaimer: string;
}

interface ForceAnalysisPanelProps {
  forces: EstimatedForces;
}

/** Helper: format force as multiples of body weight */
function toBW(forceN: number, bwN: number): string {
  if (bwN <= 0) return '—';
  return `${(forceN / bwN).toFixed(2)}x BW`;
}

/** Helper: format Newtons */
function toN(value: number): string {
  return `${Math.round(value)} N`;
}

/** Color scale for muscle force bars based on % of max */
function getForceColor(ratio: number): string {
  if (ratio > 0.8) return 'bg-red-500';
  if (ratio > 0.6) return 'bg-orange-500';
  if (ratio > 0.4) return 'bg-amber-500';
  return 'bg-emerald-500';
}

/** Impact loading rate severity */
function getLoadingRateSeverity(
  rate: number,
): 'low' | 'moderate' | 'high' | 'very-high' {
  if (rate > 12000) return 'very-high';
  if (rate > 8000) return 'high';
  if (rate > 5000) return 'moderate';
  return 'low';
}

const LOADING_RATE_COLORS: Record<string, string> = {
  low: 'text-emerald-400',
  moderate: 'text-amber-400',
  high: 'text-orange-400',
  'very-high': 'text-red-400',
};

const MUSCLE_LABELS: Array<{
  key: keyof EstimatedForces['muscleForcesN'];
  label: string;
  shortLabel: string;
}> = [
  { key: 'quadricepsPeak', label: 'Quadriceps', shortLabel: 'Quads' },
  { key: 'hamstringsPeak', label: 'Hamstrings', shortLabel: 'Hams' },
  { key: 'gastrocnemiusPeak', label: 'Gastrocnemius', shortLabel: 'Gastroc' },
  { key: 'gluteMaxPeak', label: 'Gluteus Maximus', shortLabel: 'Glutes' },
  {
    key: 'tibialisAnteriorPeak',
    label: 'Tibialis Anterior',
    shortLabel: 'Tib Ant',
  },
];

export function ForceAnalysisPanel({ forces }: ForceAnalysisPanelProps) {
  const bw = forces.runnerWeightN;

  // Find max muscle force for scaling bars
  const muscleValues = Object.values(forces.muscleForcesN);
  const maxMuscleForce = Math.max(...muscleValues, 1);

  const loadingSeverity = getLoadingRateSeverity(forces.impactLoadingRateNPerS);

  return (
    <Card className="border-slate-700 bg-slate-900">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-400" />
          <CardTitle className="text-sm font-medium text-slate-100">
            Estimated Running Forces
          </CardTitle>
          <Badge variant="warning">Experimental</Badge>
        </div>
        <p className="text-xs text-slate-500">
          Synthetic proxy values from simplified biomechanics model — NOT
          clinical-grade.
        </p>
      </CardHeader>

      <div className="space-y-4 px-6 pb-5">
        {/* Ground Reaction Force — primary metric */}
        <div className="rounded-lg bg-slate-800 p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-medium text-slate-400">
              Estimated Vertical GRF Peak
            </span>
            <span className="text-xs text-slate-500">
              {forces.speedKmh.toFixed(1)} km/h
            </span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-100">
              {toBW(forces.groundReactionForceN, bw)}
            </span>
            <span className="text-sm text-slate-400">
              ({toN(forces.groundReactionForceN)})
            </span>
          </div>
        </div>

        {/* Braking vs Propulsive forces */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-slate-800 p-3">
            <span className="text-xs font-medium text-slate-400">
              Estimated Braking Force
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-semibold text-red-400">
                {toBW(forces.brakingForceN, bw)}
              </span>
              <span className="text-xs text-slate-500">
                {toN(forces.brakingForceN)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-700">
              <div
                className="h-full rounded-full bg-red-500 transition-all"
                style={{
                  width: `${Math.min(100, (forces.brakingForceN / bw) * 100)}%`,
                }}
              />
            </div>
          </div>

          <div className="rounded-lg bg-slate-800 p-3">
            <span className="text-xs font-medium text-slate-400">
              Estimated Propulsive Force
            </span>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-lg font-semibold text-emerald-400">
                {toBW(forces.propulsiveForceN, bw)}
              </span>
              <span className="text-xs text-slate-500">
                {toN(forces.propulsiveForceN)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-700">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{
                  width: `${Math.min(100, (forces.propulsiveForceN / bw) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Impact loading rate */}
        <div className="rounded-lg bg-slate-800 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Impact Loading Rate
            </span>
            <Badge
              variant={
                loadingSeverity === 'very-high' || loadingSeverity === 'high'
                  ? 'danger'
                  : loadingSeverity === 'moderate'
                    ? 'warning'
                    : 'success'
              }
            >
              {loadingSeverity}
            </Badge>
          </div>
          <span
            className={`mt-1 block text-lg font-semibold ${LOADING_RATE_COLORS[loadingSeverity]}`}
          >
            {Math.round(forces.impactLoadingRateNPerS).toLocaleString()} N/s
          </span>
        </div>

        {/* Muscle force estimates — bar chart */}
        <div className="rounded-lg bg-slate-800 p-3">
          <span className="text-xs font-medium text-slate-400">
            Estimated Peak Muscle Forces
          </span>
          <div className="mt-2 space-y-2">
            {MUSCLE_LABELS.map(({ key, label, shortLabel }) => {
              const forceN = forces.muscleForcesN[key];
              const ratio = forceN / maxMuscleForce;
              return (
                <div key={key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300" title={label}>
                      {shortLabel}
                    </span>
                    <span className="text-slate-400">
                      {toBW(forceN, bw)} · {toN(forceN)}
                    </span>
                  </div>
                  <div className="mt-0.5 h-2 w-full rounded-full bg-slate-700">
                    <div
                      className={`h-full rounded-full transition-all ${getForceColor(ratio)}`}
                      style={{ width: `${(ratio * 100).toFixed(1)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scientific disclaimer */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-900/50 bg-amber-950/30 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-xs leading-relaxed text-amber-200/80">
            {forces.disclaimer}
          </p>
        </div>
      </div>
    </Card>
  );
}
