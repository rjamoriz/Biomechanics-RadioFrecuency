import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import { RealtimeMetrics } from '../metrics/realtime-metrics.service';
import {
  InjuryRiskSnapshot,
  ArticulationRisk,
  InjuryRiskFactor,
  InjuryRiskLevel,
  classifyRiskLevel,
} from './injury-risk.types';

/**
 * Injury Risk Service — Gateway layer.
 *
 * Derives a per-snapshot injury risk assessment from existing proxy metrics.
 * Uses the same weighted scoring approach as the ML layer's InjuryRiskEstimator.
 *
 * All outputs are EXPERIMENTAL proxy estimates.
 * Not for clinical or medical use.
 */

// ─── Thresholds ─────────────────────────────────────────────────────
const SAFE_SYMMETRY_PROXY     = 0.85;
const SAFE_FATIGUE_DRIFT      = 0.30;
const SAFE_FORM_STABILITY     = 0.75;
const MEAN_CONTACT_TIME_MS    = 250.0;
const SAFE_CONTACT_TIME_RATIO = 1.25;
const SAFE_STEP_VARIABILITY   = 0.12;

// ─── Weights ────────────────────────────────────────────────────────
const WEIGHTS = {
  asymmetry:        0.27,
  fatigue_drift:    0.22,
  form_stability:   0.22,
  contact_time:     0.16,
  step_variability: 0.13,
} as const;

// ─── Helpers ────────────────────────────────────────────────────────

function clamp(v: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, v));
}

function scoreAsymmetry(symmetryProxy: number): [number, boolean] {
  const asymmetry = 1 - symmetryProxy;
  const range = 1 - SAFE_SYMMETRY_PROXY;
  return [clamp(asymmetry / (range + 1e-9)), symmetryProxy < SAFE_SYMMETRY_PROXY];
}

function scoreFatigue(fatigueDrift: number): [number, boolean] {
  return [clamp(fatigueDrift), fatigueDrift > SAFE_FATIGUE_DRIFT];
}

function scoreForm(formStability: number): [number, boolean] {
  const instability = 1 - formStability;
  const range = 1 - SAFE_FORM_STABILITY;
  return [clamp(instability / (range + 1e-9)), formStability < SAFE_FORM_STABILITY];
}

function scoreContactTime(contactTimeMs: number): [number, boolean] {
  const ratio = contactTimeMs / MEAN_CONTACT_TIME_MS;
  let score = 0;
  if (ratio > SAFE_CONTACT_TIME_RATIO) {
    score = clamp((ratio - 1.0) / 0.5);
  } else if (ratio < 0.75) {
    score = clamp((0.75 - ratio) / 0.3);
  }
  return [score, ratio > SAFE_CONTACT_TIME_RATIO || ratio < 0.75];
}

function scoreVariability(cv: number): [number, boolean] {
  return [clamp(cv / 0.30), cv > SAFE_STEP_VARIABILITY];
}

function confidenceLabel(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.7) return 'high';
  if (score >= 0.4) return 'medium';
  return 'low';
}

// ─── Per-articulation decomposition ─────────────────────────────────

function buildArticulationRisks(
  factorScores: Record<string, number>,
  flightTimeMs: number,
  contactTimeMs: number,
  baseConfidence: number,
): ArticulationRisk[] {
  const a = factorScores['asymmetry'] ?? 0;
  const f = factorScores['fatigue_drift'] ?? 0;
  const form = factorScores['form_stability'] ?? 0;
  const c = factorScores['contact_time'] ?? 0;
  const v = factorScores['step_variability'] ?? 0;

  const flightToContact = flightTimeMs / Math.max(contactTimeMs, 1);
  const impactRisk = flightToContact < 0.60 ? clamp((0.60 - flightToContact) / 0.30) : 0;

  const kneeScore  = clamp(0.35 * a + 0.30 * c + 0.25 * impactRisk + 0.10 * v);
  const hipScore   = clamp(0.40 * a + 0.35 * f + 0.15 * form + 0.10 * v);
  const ankleScore = clamp(0.40 * c + 0.30 * impactRisk + 0.20 * v + 0.10 * a);
  const lumbarScore = clamp(0.30 * f + 0.30 * form + 0.25 * a + 0.15 * c);

  return [
    { joint: 'knee_left',   riskScore: kneeScore,   riskLevel: classifyRiskLevel(kneeScore),   confidence: baseConfidence * 0.85, primaryDriver: c >= a ? 'contact_time'  : 'asymmetry'   },
    { joint: 'knee_right',  riskScore: kneeScore,   riskLevel: classifyRiskLevel(kneeScore),   confidence: baseConfidence * 0.85, primaryDriver: c >= a ? 'contact_time'  : 'asymmetry'   },
    { joint: 'hip_left',    riskScore: hipScore,    riskLevel: classifyRiskLevel(hipScore),    confidence: baseConfidence * 0.80, primaryDriver: a >= f ? 'asymmetry'     : 'fatigue_drift'},
    { joint: 'hip_right',   riskScore: hipScore,    riskLevel: classifyRiskLevel(hipScore),    confidence: baseConfidence * 0.80, primaryDriver: a >= f ? 'asymmetry'     : 'fatigue_drift'},
    { joint: 'ankle_left',  riskScore: ankleScore,  riskLevel: classifyRiskLevel(ankleScore),  confidence: baseConfidence * 0.75, primaryDriver: c >= impactRisk ? 'contact_time' : 'impact_loading'},
    { joint: 'ankle_right', riskScore: ankleScore,  riskLevel: classifyRiskLevel(ankleScore),  confidence: baseConfidence * 0.75, primaryDriver: c >= impactRisk ? 'contact_time' : 'impact_loading'},
    { joint: 'lumbar',      riskScore: lumbarScore, riskLevel: classifyRiskLevel(lumbarScore), confidence: baseConfidence * 0.75, primaryDriver: f >= form ? 'fatigue_drift'  : 'form_stability'},
  ];
}

// ─── Service ────────────────────────────────────────────────────────

@Injectable()
export class InjuryRiskService {
  private readonly logger = new Logger(InjuryRiskService.name);
  private readonly injuryRisk$ = new Subject<InjuryRiskSnapshot>();
  private stepIntervalVariabilityEstimate = 0;
  private recentStepIntervals: number[] = [];

  readonly stream$ = this.injuryRisk$.asObservable();

  /**
   * Process a realtime metrics snapshot and emit a corresponding injury risk update.
   * Called by the websocket gateway on each metrics event.
   */
  processMetrics(metrics: RealtimeMetrics): void {
    try {
      const snapshot = this.computeRisk(metrics);
      this.injuryRisk$.next(snapshot);
    } catch (err) {
      this.logger.error('Injury risk computation failed', err);
    }
  }

  private computeRisk(m: RealtimeMetrics): InjuryRiskSnapshot {
    // Track step interval variability
    if (m.stepIntervalEstimate > 0) {
      this.recentStepIntervals.push(m.stepIntervalEstimate);
      if (this.recentStepIntervals.length > 60) this.recentStepIntervals.shift();
      if (this.recentStepIntervals.length >= 10) {
        const mean = this.recentStepIntervals.reduce((a, b) => a + b, 0) / this.recentStepIntervals.length;
        const variance = this.recentStepIntervals.reduce((s, v) => s + (v - mean) ** 2, 0) / this.recentStepIntervals.length;
        this.stepIntervalVariabilityEstimate = mean > 0 ? Math.sqrt(variance) / mean : 0;
      }
    }

    const [asymmetryScore, asymmetryElevated] = scoreAsymmetry(m.symmetryProxy);
    const [fatigueScore,   fatigueElevated]   = scoreFatigue(m.fatigueDriftScore);
    const [formScore,      formElevated]      = scoreForm(m.formStabilityScore ?? 1.0);
    const [contactScore,   contactElevated]   = scoreContactTime(m.contactTimeProxy);
    const [variabilityScore, varElevated]     = scoreVariability(this.stepIntervalVariabilityEstimate);

    const factorScores: Record<string, number> = {
      asymmetry:        asymmetryScore,
      fatigue_drift:    fatigueScore,
      form_stability:   formScore,
      contact_time:     contactScore,
      step_variability: variabilityScore,
    };

    const overallRiskScore = clamp(
      Object.entries(WEIGHTS).reduce((sum, [key, w]) => sum + w * (factorScores[key] ?? 0), 0)
    );

    const baseConfidence = m.signalQualityScore;
    const modelConfidence = clamp(baseConfidence * (0.8 + 0.2 * (1 - overallRiskScore)));

    const riskFactors: InjuryRiskFactor[] = [
      {
        id: 'asymmetry',
        label: 'Gait Asymmetry',
        value: asymmetryScore,
        weight: WEIGHTS.asymmetry,
        elevated: asymmetryElevated,
        description: `Symmetry proxy: ${m.symmetryProxy.toFixed(2)} (safe ≥${SAFE_SYMMETRY_PROXY})`,
      },
      {
        id: 'fatigue_drift',
        label: 'Fatigue Drift',
        value: fatigueScore,
        weight: WEIGHTS.fatigue_drift,
        elevated: fatigueElevated,
        description: `Fatigue drift: ${m.fatigueDriftScore.toFixed(2)} (threshold ${SAFE_FATIGUE_DRIFT})`,
      },
      {
        id: 'form_stability',
        label: 'Form Stability',
        value: formScore,
        weight: WEIGHTS.form_stability,
        elevated: formElevated,
        description: `Form stability: ${(m.formStabilityScore ?? 1).toFixed(2)} (safe ≥${SAFE_FORM_STABILITY})`,
      },
      {
        id: 'contact_time',
        label: 'Ground Contact Time',
        value: contactScore,
        weight: WEIGHTS.contact_time,
        elevated: contactElevated,
        description: `Contact time proxy: ${m.contactTimeProxy.toFixed(0)} ms (ref ~${MEAN_CONTACT_TIME_MS} ms)`,
      },
      {
        id: 'step_variability',
        label: 'Step Interval Variability',
        value: variabilityScore,
        weight: WEIGHTS.step_variability,
        elevated: varElevated,
        description: `Step interval CV: ${this.stepIntervalVariabilityEstimate.toFixed(3)} (safe ≤${SAFE_STEP_VARIABILITY})`,
      },
    ];

    const articulationRisks = buildArticulationRisks(
      factorScores,
      m.flightTimeProxy,
      m.contactTimeProxy,
      baseConfidence,
    );

    return {
      timestamp: m.timestamp,
      overallRiskScore,
      overallRiskLevel: classifyRiskLevel(overallRiskScore),
      articulationRisks,
      riskFactors,
      modelConfidence,
      confidenceLevel: confidenceLabel(modelConfidence),
      signalQualityScore: m.signalQualityScore,
      validationStatus: 'experimental',
      usedInferredJointAngles: false,
      experimental: true,
    };
  }
}
