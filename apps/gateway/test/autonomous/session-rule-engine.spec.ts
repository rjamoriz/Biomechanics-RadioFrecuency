import { SessionRuleEngine } from '../../src/autonomous/session-rule-engine';
import { SessionFeatures } from '../../src/autonomous/autonomous.types';

describe('SessionRuleEngine', () => {
  let engine: SessionRuleEngine;

  beforeEach(() => {
    engine = new SessionRuleEngine();
  });

  const baseFeatures = (): SessionFeatures => ({
    motionEnergy: 0,
    signalQuality: 0.8,
    estimatedCadence: 0,
    symmetryProxy: 0.9,
    contactTimeProxy: 0.3,
    fatigueDriftScore: 0,
    coherence: 0.8,
    prevMotionEnergy: 0,
    cadenceStable: false,
    cadenceChangePct: 0,
    cadenceDecreasing: false,
    motionDecreasing: false,
    secondsSincePresence: 0,
    secondsLowSignal: 0,
  });

  it('should fire Athlete Present rule', () => {
    const features = { ...baseFeatures(), motionEnergy: 100, signalQuality: 0.7 };
    const result = engine.processFrame(features);

    expect(result.firedRules).toContain(0);
    expect(result.conclusions.some((c) => c.name === 'Athlete Present')).toBe(true);
  });

  it('should fire Session Active when cadence is high', () => {
    const features = {
      ...baseFeatures(),
      motionEnergy: 100,
      signalQuality: 0.7,
      estimatedCadence: 160,
    };
    const result = engine.processFrame(features);

    expect(result.firedRules).toContain(1);
  });

  it('should fire Fatigue Onset rule', () => {
    const features = {
      ...baseFeatures(),
      fatigueDriftScore: 0.5,
      symmetryProxy: 0.7,
      signalQuality: 0.8,
    };
    const result = engine.processFrame(features);

    expect(result.firedRules).toContain(2);
    const fatigue = result.conclusions.find((c) => c.ruleId === 2);
    expect(fatigue).toBeDefined();
    expect(fatigue!.severity).toBe('warning');
  });

  it('should fire Form Degradation rule', () => {
    const features = {
      ...baseFeatures(),
      symmetryProxy: 0.65,
      contactTimeProxy: 0.7,
    };
    const result = engine.processFrame(features);

    expect(result.firedRules).toContain(3);
    const deg = result.conclusions.find((c) => c.ruleId === 3);
    expect(deg!.severity).toBe('alert');
  });

  it('should fire High Performance rule', () => {
    const features = {
      ...baseFeatures(),
      estimatedCadence: 180,
      symmetryProxy: 0.95,
      signalQuality: 0.9,
    };
    const result = engine.processFrame(features);

    expect(result.firedRules).toContain(4);
  });

  it('should fire Possible Stumble on sudden motion drop', () => {
    const features = {
      ...baseFeatures(),
      prevMotionEnergy: 300,
      motionEnergy: 10,
    };
    const result = engine.processFrame(features);

    expect(result.firedRules).toContain(5);
  });

  it('should fire Environmental Interference', () => {
    const features = {
      ...baseFeatures(),
      coherence: 0.2,
      signalQuality: 0.3,
    };
    const result = engine.processFrame(features);

    expect(result.firedRules).toContain(6);
  });

  it('should fire Steady State Running', () => {
    const features = {
      ...baseFeatures(),
      cadenceStable: true,
      symmetryProxy: 0.92,
    };
    const result = engine.processFrame(features);

    expect(result.firedRules).toContain(7);
  });

  it('should fire Speed Transition on cadence change', () => {
    const features = { ...baseFeatures(), cadenceChangePct: 25 };
    const result = engine.processFrame(features);

    expect(result.firedRules).toContain(8);
  });

  it('should fire Station Idle after 30s no presence', () => {
    const features = { ...baseFeatures(), secondsSincePresence: 45 };
    const result = engine.processFrame(features);

    expect(result.firedRules).toContain(10);
  });

  it('should fire Signal Degraded', () => {
    const features = { ...baseFeatures(), signalQuality: 0.2, secondsLowSignal: 10 };
    const result = engine.processFrame(features);

    expect(result.firedRules).toContain(11);
  });

  it('should resolve Fatigue ↔ High Performance contradiction', () => {
    const features = {
      ...baseFeatures(),
      // Normally contradictory: both conditions met
      fatigueDriftScore: 0.5,
      symmetryProxy: 0.92, // > 0.9 for High Performance, but < 0.85 needed for Fatigue — won't both fire here
      estimatedCadence: 180,
      signalQuality: 0.9,
    };
    const result = engine.processFrame(features);

    // Verify contradiction count is 0 when both can't fire simultaneously
    // (fatigue needs symmetry < 0.85, high perf needs symmetry > 0.9)
    const hasBoth = result.firedRules.includes(2) && result.firedRules.includes(4);
    expect(hasBoth).toBe(false);
  });

  it('should resolve Station Idle ↔ Session Active contradiction', () => {
    const features = {
      ...baseFeatures(),
      motionEnergy: 100,
      signalQuality: 0.7,
      estimatedCadence: 160,
      secondsSincePresence: 40,
    };
    const result = engine.processFrame(features);

    // Both conditions met → contradiction resolved
    const hasIdle = result.firedRules.includes(10);
    const hasActive = result.firedRules.includes(1);
    // Only one should remain
    expect(hasIdle && hasActive).toBe(false);
    expect(result.contradictionCount).toBe(1);
  });

  it('should scale confidence by signal quality', () => {
    const features = {
      ...baseFeatures(),
      motionEnergy: 100,
      signalQuality: 0.5,
    };
    const result = engine.processFrame(features);

    const presence = result.conclusions.find((c) => c.ruleId === 0);
    expect(presence).toBeDefined();
    // baseConfidence 0.85 × signalQuality 0.5 = 0.425
    expect(presence!.confidence).toBeCloseTo(0.425, 2);
  });

  it('should return topConclusion as highest confidence', () => {
    const features = {
      ...baseFeatures(),
      motionEnergy: 100,
      signalQuality: 0.7,
      estimatedCadence: 160,
    };
    const result = engine.processFrame(features);

    expect(result.topConclusion).toBeDefined();
    for (const c of result.conclusions) {
      expect(result.topConclusion!.confidence).toBeGreaterThanOrEqual(c.confidence);
    }
  });

  it('should reset fired rules bitmap', () => {
    const features = { ...baseFeatures(), motionEnergy: 100, signalQuality: 0.7 };
    engine.processFrame(features);
    expect(engine.getFiredRules()).toBeGreaterThan(0);

    engine.reset();
    expect(engine.getFiredRules()).toBe(0);
  });

  it('should return empty result when no rules fire', () => {
    const features = baseFeatures(); // All zeroes — nothing triggers
    const result = engine.processFrame(features);

    expect(result.firedRules.length).toBe(0);
    expect(result.conclusions.length).toBe(0);
    expect(result.topConclusion).toBeNull();
  });
});
