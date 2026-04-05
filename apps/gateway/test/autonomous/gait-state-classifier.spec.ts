import { GaitStateClassifier } from '../../src/autonomous/gait-state-classifier';
import { GaitState, GaitFeatures } from '../../src/autonomous/autonomous.types';

describe('GaitStateClassifier', () => {
  let classifier: GaitStateClassifier;

  beforeEach(() => {
    classifier = new GaitStateClassifier();
  });

  const makeFeatures = (overrides: Partial<GaitFeatures> = {}): GaitFeatures => ({
    estimatedCadence: 0,
    symmetryProxy: 0.85,
    contactTimeProxy: 0.3,
    fatigueDriftScore: 0,
    motionEnergy: 0,
    signalQuality: 0.7,
    ...overrides,
  });

  it('should start with uniform probabilities', () => {
    const result = classifier.getClassification();
    const probs = Object.values(result.probabilities);
    // All 8 states should have equal probability (1/8 = 0.125)
    for (const p of probs) {
      expect(p).toBeCloseTo(0.125, 2);
    }
  });

  it('should converge to IDLE state with no motion', () => {
    const features = makeFeatures({ motionEnergy: 2, estimatedCadence: 5 });

    let result = classifier.getClassification();
    for (let i = 0; i < 30; i++) {
      result = classifier.processFrame(features);
    }

    expect(result.winner).toBe(GaitState.IDLE);
    expect(result.winnerProbability).toBeGreaterThan(0.3);
  });

  it('should converge to STEADY_RUNNING with stable metrics', () => {
    const features = makeFeatures({
      estimatedCadence: 160,
      symmetryProxy: 0.92,
      motionEnergy: 120,
      signalQuality: 0.8,
    });

    let result = classifier.getClassification();
    for (let i = 0; i < 30; i++) {
      result = classifier.processFrame(features);
    }

    expect(result.winner).toBe(GaitState.STEADY_RUNNING);
  });

  it('should converge to HIGH_INTENSITY with fast cadence', () => {
    const features = makeFeatures({
      estimatedCadence: 185,
      symmetryProxy: 0.93,
      motionEnergy: 200,
      signalQuality: 0.8,
    });

    let result = classifier.getClassification();
    for (let i = 0; i < 30; i++) {
      result = classifier.processFrame(features);
    }

    expect(result.winner).toBe(GaitState.HIGH_INTENSITY);
  });

  it('should detect FATIGUING state', () => {
    const features = makeFeatures({
      estimatedCadence: 155,
      symmetryProxy: 0.78,
      fatigueDriftScore: 0.5,
      motionEnergy: 100,
    });

    let result = classifier.getClassification();
    for (let i = 0; i < 30; i++) {
      result = classifier.processFrame(features);
    }

    expect(result.winner).toBe(GaitState.FATIGUING);
  });

  it('should apply Grover diffusion (reflect about mean)', () => {
    // After one frame, probabilities should no longer be uniform
    const features = makeFeatures({ motionEnergy: 5, estimatedCadence: 10 });
    const result = classifier.processFrame(features);

    const probs = Object.values(result.probabilities);
    const allEqual = probs.every((p) => Math.abs(p - probs[0]) < 0.001);
    expect(allEqual).toBe(false);
  });

  it('should keep probabilities summing to ~1', () => {
    const features = makeFeatures({ estimatedCadence: 160, motionEnergy: 100 });

    for (let i = 0; i < 20; i++) {
      classifier.processFrame(features);
    }

    const result = classifier.getClassification();
    const sum = Object.values(result.probabilities).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 1);
  });

  it('should count iterations', () => {
    const features = makeFeatures({ motionEnergy: 50 });
    classifier.processFrame(features);
    classifier.processFrame(features);
    classifier.processFrame(features);

    expect(classifier.getClassification().iterations).toBe(3);
  });

  it('should reset to uniform state', () => {
    const features = makeFeatures({ estimatedCadence: 180, motionEnergy: 200 });
    for (let i = 0; i < 10; i++) classifier.processFrame(features);

    classifier.reset();
    const result = classifier.getClassification();
    expect(result.iterations).toBe(0);

    const probs = Object.values(result.probabilities);
    for (const p of probs) {
      expect(p).toBeCloseTo(0.125, 2);
    }
  });

  it('should have all probabilities non-negative', () => {
    const features = makeFeatures({
      estimatedCadence: 90,
      symmetryProxy: 0.6,
      motionEnergy: 40,
    });

    for (let i = 0; i < 20; i++) {
      classifier.processFrame(features);
    }

    const result = classifier.getClassification();
    for (const p of Object.values(result.probabilities)) {
      expect(p).toBeGreaterThanOrEqual(0);
    }
  });
});
