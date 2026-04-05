import { CoherenceGate, GATE_THRESHOLD, MAX_CONSECUTIVE_REJECTIONS } from '../../src/signal/coherence-gate';
import { CoherenceState } from '../../src/autonomous/autonomous.types';

function makeCoherence(overrides: Partial<CoherenceState> = {}): CoherenceState {
  return {
    coherence: 0.8,
    entropy: 0.2,
    normalizedEntropy: 0.3,
    blochVector: [0, 0.6, 0.8],
    frameCount: 10,
    isDecoherenceEvent: false,
    blochDrift: 0.01,
    ...overrides,
  };
}

describe('CoherenceGate', () => {
  let gate: CoherenceGate;

  beforeEach(() => {
    gate = new CoherenceGate();
  });

  describe('gate score computation', () => {
    it('computes correct gate score with high-quality inputs', () => {
      const coherence = makeCoherence({ coherence: 1, normalizedEntropy: 0 });
      const decision = gate.evaluate(coherence, 1);
      // score = 0.6*1 + 0.25*(1-0) + 0.15*1 = 1.0
      expect(decision.gateScore).toBeCloseTo(1.0, 4);
      expect(decision.accepted).toBe(true);
      expect(decision.reason).toBe('accepted');
    });

    it('computes correct gate score with low-quality inputs', () => {
      const coherence = makeCoherence({ coherence: 0, normalizedEntropy: 1 });
      const decision = gate.evaluate(coherence, 0);
      // score = 0.6*0 + 0.25*(1-1) + 0.15*0 = 0
      expect(decision.gateScore).toBeCloseTo(0, 4);
      expect(decision.accepted).toBe(false);
    });

    it('computes blended score with mixed inputs', () => {
      const coherence = makeCoherence({ coherence: 0.5, normalizedEntropy: 0.5 });
      const decision = gate.evaluate(coherence, 0.5);
      // score = 0.6*0.5 + 0.25*0.5 + 0.15*0.5 = 0.3+0.125+0.075 = 0.5
      expect(decision.gateScore).toBeCloseTo(0.5, 4);
      expect(decision.accepted).toBe(true);
    });
  });

  describe('threshold gating', () => {
    it('accepts frames at exactly the threshold', () => {
      // Need score >= 0.35
      // score = 0.6*c + 0.25*(1-e) + 0.15*q = 0.35
      // With e=0.5, q=0: 0.6*c + 0.125 = 0.35 → c = 0.375
      const coherence = makeCoherence({ coherence: 0.375, normalizedEntropy: 0.5 });
      const decision = gate.evaluate(coherence, 0);
      expect(decision.gateScore).toBeCloseTo(0.35, 2);
      expect(decision.accepted).toBe(true);
    });

    it('rejects frames below threshold', () => {
      const coherence = makeCoherence({ coherence: 0.1, normalizedEntropy: 0.9 });
      const decision = gate.evaluate(coherence, 0.1);
      expect(decision.gateScore).toBeLessThan(GATE_THRESHOLD);
      expect(decision.accepted).toBe(false);
    });

    it('accepts with custom threshold', () => {
      const lowGate = new CoherenceGate(0.1);
      const coherence = makeCoherence({ coherence: 0.15, normalizedEntropy: 0.9 });
      const decision = lowGate.evaluate(coherence, 0.1);
      expect(decision.accepted).toBe(true);
    });
  });

  describe('force-accept after MAX_CONSECUTIVE_REJECTIONS', () => {
    it('force-accepts after max consecutive rejections', () => {
      const badCoherence = makeCoherence({ coherence: 0, normalizedEntropy: 1 });

      // Reject MAX_CONSECUTIVE_REJECTIONS times
      for (let i = 0; i < MAX_CONSECUTIVE_REJECTIONS; i++) {
        const decision = gate.evaluate(badCoherence, 0);
        expect(decision.accepted).toBe(false);
        expect(decision.consecutiveRejections).toBe(i + 1);
      }

      // Next one should be force-accepted
      const forced = gate.evaluate(badCoherence, 0);
      expect(forced.accepted).toBe(true);
      expect(forced.reason).toBe('force_accepted');
      expect(forced.consecutiveRejections).toBe(0);
    });

    it('resets consecutive counter on a natural accept', () => {
      const badCoherence = makeCoherence({ coherence: 0, normalizedEntropy: 1 });
      const goodCoherence = makeCoherence({ coherence: 1, normalizedEntropy: 0 });

      // Reject a few
      for (let i = 0; i < 5; i++) {
        gate.evaluate(badCoherence, 0);
      }

      // Natural accept resets counter
      const decision = gate.evaluate(goodCoherence, 1);
      expect(decision.accepted).toBe(true);
      expect(decision.consecutiveRejections).toBe(0);
      expect(decision.reason).toBe('accepted');
    });
  });

  describe('acceptance rate EMA', () => {
    it('starts at 1.0 for first accepted frame', () => {
      const coherence = makeCoherence({ coherence: 1, normalizedEntropy: 0 });
      const decision = gate.evaluate(coherence, 1);
      expect(decision.acceptanceRate).toBe(1);
    });

    it('starts at 0.0 for first rejected frame', () => {
      const coherence = makeCoherence({ coherence: 0, normalizedEntropy: 1 });
      const decision = gate.evaluate(coherence, 0);
      expect(decision.acceptanceRate).toBe(0);
    });

    it('acceptance rate decreases with rejections', () => {
      const good = makeCoherence({ coherence: 1, normalizedEntropy: 0 });
      const bad = makeCoherence({ coherence: 0, normalizedEntropy: 1 });

      gate.evaluate(good, 1);
      const initialRate = gate.getAcceptanceRate();

      // Several rejections should decrease the rate
      for (let i = 0; i < 10; i++) {
        gate.evaluate(bad, 0);
      }

      expect(gate.getAcceptanceRate()).toBeLessThan(initialRate);
    });

    it('getAcceptanceRate() matches last decision', () => {
      const coherence = makeCoherence({ coherence: 0.8, normalizedEntropy: 0.2 });
      const decision = gate.evaluate(coherence, 0.8);
      expect(gate.getAcceptanceRate()).toBe(decision.acceptanceRate);
    });
  });

  describe('rejection reason classification', () => {
    it('identifies low_coherence as dominant cause', () => {
      const coherence = makeCoherence({ coherence: 0, normalizedEntropy: 0 });
      const decision = gate.evaluate(coherence, 0.5);
      expect(decision.accepted).toBe(false);
      expect(decision.reason).toBe('low_coherence');
    });

    it('identifies high_entropy as dominant cause', () => {
      const coherence = makeCoherence({ coherence: 0.3, normalizedEntropy: 1 });
      const decision = gate.evaluate(coherence, 0.5);
      expect(decision.accepted).toBe(false);
      expect(decision.reason).toBe('high_entropy');
    });

    it('identifies low_quality as dominant cause', () => {
      // coherence and entropy contribute, but quality=0 is the weakest link
      // Score = 0.6*0.5 + 0.25*(1-0.2) + 0.15*0 = 0.3 + 0.2 + 0 = 0.5 → not useful (passes)
      // Use lower coherence: 0.6*0.1 + 0.25*(1-0.3) + 0.15*0 = 0.06+0.175+0 = 0.235 → rejected
      const coherence = makeCoherence({ coherence: 0.1, normalizedEntropy: 0.3 });
      const decision = gate.evaluate(coherence, 0);
      expect(decision.accepted).toBe(false);
      expect(decision.reason).toBe('low_quality');
    });
  });

  describe('reset', () => {
    it('resets acceptance rate and consecutive rejections', () => {
      const bad = makeCoherence({ coherence: 0, normalizedEntropy: 1 });
      for (let i = 0; i < 10; i++) {
        gate.evaluate(bad, 0);
      }

      gate.reset();
      expect(gate.getAcceptanceRate()).toBe(1);

      // After reset, first frame sets acceptance fresh
      const good = makeCoherence({ coherence: 1, normalizedEntropy: 0 });
      const decision = gate.evaluate(good, 1);
      expect(decision.acceptanceRate).toBe(1);
      expect(decision.consecutiveRejections).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('clamps signal quality above 1', () => {
      const coherence = makeCoherence({ coherence: 0.5, normalizedEntropy: 0.5 });
      const decision = gate.evaluate(coherence, 5); // over 1
      // Should clamp to 1: 0.6*0.5 + 0.25*0.5 + 0.15*1 = 0.575
      expect(decision.gateScore).toBeCloseTo(0.575, 3);
    });

    it('clamps signal quality below 0', () => {
      const coherence = makeCoherence({ coherence: 0.5, normalizedEntropy: 0.5 });
      const decision = gate.evaluate(coherence, -1); // below 0
      // Should clamp to 0: 0.6*0.5 + 0.25*0.5 + 0.15*0 = 0.425
      expect(decision.gateScore).toBeCloseTo(0.425, 3);
    });
  });
});
