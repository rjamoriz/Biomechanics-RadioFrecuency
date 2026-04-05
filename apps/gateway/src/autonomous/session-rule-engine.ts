/**
 * Session Rule Engine (Forward-chaining)
 *
 * Interprets CSI-derived metrics + gait state into high-level autonomous
 * session conclusions and alerts. 12 rules with contradiction resolution.
 *
 * All outputs are estimated proxy conclusions — not clinical-grade.
 */

import {
  SessionFeatures,
  SessionRuleResult,
  SessionConclusion,
  Severity,
} from './autonomous.types';

// ─── Rule Definitions ───────────────────────────────────────────────

interface RuleDefinition {
  id: number;
  name: string;
  baseConfidence: number;
  severity: Severity;
  evaluate: (f: SessionFeatures) => boolean;
}

const RULES: RuleDefinition[] = [
  {
    id: 0,
    name: 'Athlete Present',
    baseConfidence: 0.85,
    severity: 'info',
    evaluate: (f) => f.motionEnergy > 50 && f.signalQuality > 0.4,
  },
  {
    id: 1,
    name: 'Session Active',
    baseConfidence: 0.90,
    severity: 'info',
    evaluate: (f) => f.motionEnergy > 50 && f.signalQuality > 0.4 && f.estimatedCadence > 100,
  },
  {
    id: 2,
    name: 'Fatigue Onset',
    baseConfidence: 0.75,
    severity: 'warning',
    evaluate: (f) => f.fatigueDriftScore > 0.3 && f.symmetryProxy < 0.85,
  },
  {
    id: 3,
    name: 'Form Degradation',
    baseConfidence: 0.80,
    severity: 'alert',
    evaluate: (f) => f.symmetryProxy < 0.75 && f.contactTimeProxy > 0.6,
  },
  {
    id: 4,
    name: 'High Performance',
    baseConfidence: 0.85,
    severity: 'info',
    evaluate: (f) => f.estimatedCadence > 170 && f.symmetryProxy > 0.9 && f.signalQuality > 0.7,
  },
  {
    id: 5,
    name: 'Possible Stumble',
    baseConfidence: 0.70,
    severity: 'alert',
    evaluate: (f) => f.prevMotionEnergy > 200 && f.motionEnergy < 20,
  },
  {
    id: 6,
    name: 'Environmental Interference',
    baseConfidence: 0.80,
    severity: 'warning',
    evaluate: (f) => f.coherence < 0.4 && f.signalQuality < 0.5,
  },
  {
    id: 7,
    name: 'Steady State Running',
    baseConfidence: 0.90,
    severity: 'info',
    evaluate: (f) => f.cadenceStable && f.symmetryProxy > 0.85,
  },
  {
    id: 8,
    name: 'Speed Transition',
    baseConfidence: 0.75,
    severity: 'info',
    evaluate: (f) => Math.abs(f.cadenceChangePct) > 15,
  },
  {
    id: 9,
    name: 'Cooldown Phase',
    baseConfidence: 0.80,
    severity: 'info',
    evaluate: (f) => f.cadenceDecreasing && f.motionDecreasing,
  },
  {
    id: 10,
    name: 'Station Idle',
    baseConfidence: 0.95,
    severity: 'info',
    evaluate: (f) => f.secondsSincePresence > 30,
  },
  {
    id: 11,
    name: 'Signal Degraded',
    baseConfidence: 0.90,
    severity: 'warning',
    evaluate: (f) => f.signalQuality < 0.3 && f.secondsLowSignal > 5,
  },
];

// Contradiction pairs: both cannot be true simultaneously
const CONTRADICTION_PAIRS: [number, number][] = [
  [2, 4],  // Fatigue Onset ↔ High Performance
  [10, 1], // Station Idle ↔ Session Active
  [3, 7],  // Form Degradation ↔ Steady State Running
];

// ─── Implementation ─────────────────────────────────────────────────

export class SessionRuleEngine {
  private firedBitmap = 0;

  /**
   * Evaluate all rules against the current feature set.
   */
  processFrame(features: SessionFeatures): SessionRuleResult {
    const fired: number[] = [];
    const conclusions: SessionConclusion[] = [];

    for (const rule of RULES) {
      if (rule.evaluate(features)) {
        fired.push(rule.id);
        conclusions.push({
          ruleId: rule.id,
          name: rule.name,
          confidence: round3(rule.baseConfidence * features.signalQuality),
          severity: rule.severity,
        });
      }
    }

    // Resolve contradictions: keep the one with higher confidence
    let contradictionCount = 0;
    for (const [a, b] of CONTRADICTION_PAIRS) {
      const idxA = conclusions.findIndex((c) => c.ruleId === a);
      const idxB = conclusions.findIndex((c) => c.ruleId === b);
      if (idxA >= 0 && idxB >= 0) {
        contradictionCount++;
        // Remove the lower-confidence conclusion
        if (conclusions[idxA].confidence < conclusions[idxB].confidence) {
          conclusions.splice(idxA, 1);
          fired.splice(fired.indexOf(a), 1);
        } else {
          conclusions.splice(idxB, 1);
          fired.splice(fired.indexOf(b), 1);
        }
      }
    }

    // Update bitmap
    this.firedBitmap = 0;
    for (const id of fired) this.firedBitmap |= 1 << id;

    // Top conclusion = highest confidence
    const topConclusion =
      conclusions.length > 0
        ? conclusions.reduce((best, c) => (c.confidence > best.confidence ? c : best))
        : null;

    return {
      firedRules: fired,
      conclusions,
      contradictionCount,
      topConclusion,
    };
  }

  getFiredRules(): number {
    return this.firedBitmap;
  }

  reset(): void {
    this.firedBitmap = 0;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
