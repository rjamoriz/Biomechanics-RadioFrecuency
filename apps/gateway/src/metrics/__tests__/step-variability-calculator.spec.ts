import { StepVariabilityCalculator, StepTiming } from '../step-variability-calculator';

describe('StepVariabilityCalculator', () => {
  let calculator: StepVariabilityCalculator;

  beforeEach(() => {
    calculator = new StepVariabilityCalculator({ windowSize: 20 });
  });

  describe('initialization', () => {
    it('should create with default options', () => {
      const c = new StepVariabilityCalculator();
      expect(c).toBeDefined();
    });

    it('should return null with insufficient data', () => {
      expect(calculator.compute()).toBeNull();
    });

    it('should return null with fewer than 3 steps', () => {
      calculator.addStep({ stepIntervalMs: 350 });
      calculator.addStep({ stepIntervalMs: 355 });
      expect(calculator.compute()).toBeNull();
    });
  });

  describe('happy path — steady running', () => {
    it('should compute variability for consistent running', () => {
      // ~170 spm → ~353ms per step, low variability
      for (let i = 0; i < 20; i++) {
        calculator.addStep({
          stepIntervalMs: 350 + (Math.random() - 0.5) * 10,
          stanceDurationMs: 220 + (Math.random() - 0.5) * 5,
          swingDurationMs: 130 + (Math.random() - 0.5) * 5,
        });
      }

      const result = calculator.compute(0.9);
      expect(result).not.toBeNull();
      expect(result!.stepIntervalMean).toBeGreaterThan(340);
      expect(result!.stepIntervalMean).toBeLessThan(360);
      expect(result!.stepIntervalCv).toBeLessThan(5); // Low CV = consistent
      expect(result!.stanceTimeMean).toBeGreaterThan(0);
      expect(result!.swingTimeMean).toBeGreaterThan(0);
      expect(result!.gaitStabilityScore).toBeGreaterThan(50);
      expect(result!.confidence).toBeGreaterThan(0);
      expect(result!.confidence).toBeLessThanOrEqual(1);
      expect(result!.validationStatus).toBe('unvalidated');
      expect(result!.windowSize).toBe(20);
    });
  });

  describe('stride time computation', () => {
    it('should compute stride time from pairs of steps', () => {
      for (let i = 0; i < 10; i++) {
        calculator.addStep({ stepIntervalMs: 350 });
      }

      const result = calculator.compute();
      expect(result).not.toBeNull();
      expect(result!.strideTimeMean).toBeCloseTo(700, 0);
      expect(result!.strideTimeCv).toBeCloseTo(0, 1); // Zero variability
    });
  });

  describe('left-right asymmetry', () => {
    it('should compute asymmetry index when side labels present', () => {
      for (let i = 0; i < 20; i++) {
        calculator.addStep({
          stepIntervalMs: i % 2 === 0 ? 340 : 360,
          side: i % 2 === 0 ? 'left' : 'right',
        });
      }

      const result = calculator.compute();
      expect(result).not.toBeNull();
      expect(result!.leftRightAsymmetryIndex).not.toBeNull();
      expect(result!.leftRightAsymmetryIndex!).toBeGreaterThan(0);
      expect(result!.leftRightAsymmetryIndex!).toBeLessThan(1);
    });

    it('should return null asymmetry when no side labels', () => {
      for (let i = 0; i < 10; i++) {
        calculator.addStep({ stepIntervalMs: 350 });
      }

      const result = calculator.compute();
      expect(result).not.toBeNull();
      expect(result!.leftRightAsymmetryIndex).toBeNull();
    });

    it('should return 0 asymmetry for perfectly symmetric steps', () => {
      for (let i = 0; i < 20; i++) {
        calculator.addStep({
          stepIntervalMs: 350,
          side: i % 2 === 0 ? 'left' : 'right',
        });
      }

      const result = calculator.compute();
      expect(result).not.toBeNull();
      expect(result!.leftRightAsymmetryIndex).toBe(0);
    });
  });

  describe('gait stability score', () => {
    it('should give high stability to zero-variability data', () => {
      for (let i = 0; i < 20; i++) {
        calculator.addStep({ stepIntervalMs: 350 });
      }

      const result = calculator.compute();
      expect(result).not.toBeNull();
      expect(result!.gaitStabilityScore).toBe(100);
    });

    it('should give lower stability to high-variability data', () => {
      for (let i = 0; i < 20; i++) {
        calculator.addStep({ stepIntervalMs: 200 + Math.random() * 300 });
      }

      const result = calculator.compute();
      expect(result).not.toBeNull();
      expect(result!.gaitStabilityScore).toBeLessThan(80);
    });
  });

  describe('edge cases', () => {
    it('should handle exactly 3 steps (minimum)', () => {
      calculator.addStep({ stepIntervalMs: 350 });
      calculator.addStep({ stepIntervalMs: 355 });
      calculator.addStep({ stepIntervalMs: 348 });

      const result = calculator.compute();
      expect(result).not.toBeNull();
      expect(result!.windowSize).toBe(3);
    });

    it('should handle steps with only step interval (no stance/swing)', () => {
      for (let i = 0; i < 10; i++) {
        calculator.addStep({ stepIntervalMs: 350 + i });
      }

      const result = calculator.compute();
      expect(result).not.toBeNull();
      expect(result!.stanceTimeMean).toBeNull();
      expect(result!.swingTimeMean).toBeNull();
    });

    it('should use rolling window and not grow unbounded', () => {
      for (let i = 0; i < 100; i++) {
        calculator.addStep({ stepIntervalMs: 350 + (i > 80 ? 50 : 0) });
      }

      const result = calculator.compute();
      expect(result).not.toBeNull();
      // Window should be capped at windowSize
      expect(result!.windowSize).toBeLessThanOrEqual(20);
    });
  });

  describe('confidence scoring', () => {
    it('should reflect signal quality in confidence', () => {
      for (let i = 0; i < 20; i++) {
        calculator.addStep({ stepIntervalMs: 350 });
      }

      const highQ = calculator.compute(1.0);
      const lowQ = calculator.compute(0.2);
      expect(highQ!.confidence).toBeGreaterThan(lowQ!.confidence);
    });

    it('should penalise partial windows', () => {
      calculator.addStep({ stepIntervalMs: 350 });
      calculator.addStep({ stepIntervalMs: 355 });
      calculator.addStep({ stepIntervalMs: 348 });

      const result = calculator.compute(1.0);
      // 3/20 = 0.15 fullness → confidence should be lower than a full window
      expect(result!.confidence).toBeLessThan(1.0);
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      for (let i = 0; i < 20; i++) {
        calculator.addStep({ stepIntervalMs: 350 });
      }
      calculator.reset();
      expect(calculator.compute()).toBeNull();
    });
  });
});
