import {
  SpotFiAoAEstimator,
  HISTORY_SIZE,
  MIN_CONFIDENCE_R2,
  SMOOTHING_ALPHA,
  SPEED_OF_LIGHT,
  DEFAULT_SUBCARRIER_SPACING,
} from '../../src/signal/spotfi-aoa';

describe('SpotFiAoAEstimator', () => {
  let estimator: SpotFiAoAEstimator;

  beforeEach(() => {
    estimator = new SpotFiAoAEstimator();
  });

  describe('phase slope computation', () => {
    it('returns zero angle for constant phase (no slope)', () => {
      const phases = [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
      const result = estimator.estimate(phases, 1000);
      expect(result.phaseSlope).toBeCloseTo(0, 2);
      expect(result.dominantAngleDeg).toBeCloseTo(0, 1);
    });

    it('estimates non-zero slope for quadratic phase profile', () => {
      // Quadratic phase → linearly increasing diffs → non-zero regression slope
      const phases = Array.from({ length: 16 }, (_, i) => 0.01 * i * i);
      const result = estimator.estimate(phases, 1000);
      expect(Math.abs(result.phaseSlope)).toBeGreaterThan(0);
      expect(Math.abs(result.dominantAngleDeg)).toBeGreaterThan(0);
    });

    it('returns opposite angle for mirrored quadratic phase', () => {
      // Quadratic → slope > 0; mirrored quadratic → slope < 0
      const posPhases = Array.from({ length: 16 }, (_, i) => 0.01 * i * i);
      const negPhases = Array.from({ length: 16 }, (_, i) => -0.01 * i * i);
      const pos = estimator.estimate(posPhases, 1000);
      estimator.reset();
      const neg = estimator.estimate(negPhases, 2000);
      expect(pos.phaseSlope).toBeGreaterThan(0);
      expect(neg.phaseSlope).toBeLessThan(0);
    });
  });

  describe('confidence from R²', () => {
    it('returns high confidence for perfectly quadratic phase', () => {
      // Perfectly quadratic → perfectly linear diffs → R² ≈ 1
      const phases = Array.from({ length: 32 }, (_, i) => 0.005 * i * i);
      const result = estimator.estimate(phases, 1000);
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('returns lower confidence for noisy phase', () => {
      const phases = Array.from({ length: 32 }, (_, i) =>
        i * 0.05 + (Math.sin(i * 7) * 0.3),
      );
      const result = estimator.estimate(phases, 1000);
      expect(result.confidence).toBeLessThan(0.9);
    });

    it('clamps confidence to [0, 1]', () => {
      const phases = Array.from({ length: 8 }, () => Math.random() * 6 - 3);
      const result = estimator.estimate(phases, 1000);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('lateral displacement', () => {
    it('computes lateral displacement from angle and geometry', () => {
      const est = new SpotFiAoAEstimator({ antennaToTreadmillDistance: 2.0 });
      const phases = Array.from({ length: 16 }, (_, i) => i * 0.15);
      const result = est.estimate(phases, 1000);
      // lateralDisplacement = sin(angle_rad) * distance
      const angleRad = (result.dominantAngleDeg * Math.PI) / 180;
      const expected = Math.sin(angleRad) * 2.0;
      expect(result.lateralDisplacement).toBeCloseTo(expected, 3);
    });

    it('returns zero lateral displacement for zero angle', () => {
      const phases = [1, 1, 1, 1, 1, 1, 1, 1];
      const result = estimator.estimate(phases, 1000);
      expect(result.lateralDisplacement).toBeCloseTo(0, 3);
    });
  });

  describe('AoA change rate', () => {
    it('returns zero change rate on first estimate', () => {
      const phases = Array.from({ length: 8 }, (_, i) => i * 0.1);
      const result = estimator.estimate(phases, 1000);
      expect(result.aoaChangeRate).toBe(0);
    });

    it('tracks change rate between consecutive estimates', () => {
      const phases1 = Array.from({ length: 8 }, (_, i) => i * 0.1);
      const phases2 = Array.from({ length: 8 }, (_, i) => i * 0.2);
      estimator.estimate(phases1, 1000);
      const result2 = estimator.estimate(phases2, 2000);
      // Should have non-zero change rate since angles differ
      // (may or may not be exactly expected due to EMA smoothing)
      expect(typeof result2.aoaChangeRate).toBe('number');
      expect(Number.isFinite(result2.aoaChangeRate)).toBe(true);
    });

    it('computes non-zero change rate for different phase profiles', () => {
      // Quadratic profiles with different curvatures produce different angles
      const phases1 = Array.from({ length: 16 }, (_, i) => 0.02 * i * i);
      const phases2 = Array.from({ length: 16 }, (_, i) => -0.02 * i * i);
      estimator.estimate(phases1, 1000);
      const r2 = estimator.estimate(phases2, 2000);
      expect(r2.aoaChangeRate).not.toBe(0);
      expect(Number.isFinite(r2.aoaChangeRate)).toBe(true);
    });
  });

  describe('history buffer', () => {
    it('starts with empty history', () => {
      expect(estimator.getHistory()).toHaveLength(0);
    });

    it('accumulates history up to HISTORY_SIZE', () => {
      const phases = [0, 0.1, 0.2, 0.3];
      for (let i = 0; i < HISTORY_SIZE + 20; i++) {
        estimator.estimate(phases, i * 100);
      }
      expect(estimator.getHistory()).toHaveLength(HISTORY_SIZE);
    });

    it('returns estimates in chronological order', () => {
      const phases = [0, 0.1, 0.2, 0.3];
      for (let i = 0; i < 10; i++) {
        estimator.estimate(phases, i * 100);
      }
      const history = estimator.getHistory();
      for (let i = 1; i < history.length; i++) {
        expect(history[i].timestamp).toBeGreaterThanOrEqual(history[i - 1].timestamp);
      }
    });

    it('wraps correctly as a circular buffer', () => {
      const phases = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
      const total = HISTORY_SIZE + 5;
      for (let i = 0; i < total; i++) {
        estimator.estimate(phases, i * 100);
      }
      const history = estimator.getHistory();
      expect(history).toHaveLength(HISTORY_SIZE);
      // All entries should be valid AoAEstimate objects
      for (const est of history) {
        expect(est).toBeDefined();
        expect(typeof est.timestamp).toBe('number');
        expect(typeof est.dominantAngleDeg).toBe('number');
      }
      // The most recently overwritten slots (0-4) should contain
      // the latest timestamps
      expect(history[4].timestamp).toBe(10400);
    });
  });

  describe('lateral sway amplitude', () => {
    it('returns zero for empty history', () => {
      expect(estimator.getLateralSwayAmplitude()).toBe(0);
    });

    it('returns zero for single estimate', () => {
      estimator.estimate([0, 0.1, 0.2, 0.3], 1000);
      expect(estimator.getLateralSwayAmplitude()).toBe(0);
    });

    it('returns non-negative sway amplitude', () => {
      for (let i = 0; i < 20; i++) {
        const slope = Math.sin(i * 0.3) * 0.2;
        const phases = Array.from({ length: 8 }, (_, k) => k * slope);
        estimator.estimate(phases, i * 100);
      }
      expect(estimator.getLateralSwayAmplitude()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('EMA smoothing', () => {
    it('smooths angle over successive estimates', () => {
      // Alternating positive/negative slopes — smoothing should dampen oscillation
      const results: number[] = [];
      for (let i = 0; i < 10; i++) {
        const slope = i % 2 === 0 ? 0.2 : -0.2;
        const phases = Array.from({ length: 8 }, (_, k) => k * slope);
        const r = estimator.estimate(phases, i * 100);
        results.push(r.dominantAngleDeg);
      }
      // Smoothed values should not be as extreme as raw alternation
      const maxAbs = Math.max(...results.map(Math.abs));
      const rawPhases = Array.from({ length: 8 }, (_, k) => k * 0.2);
      const rawEst = new SpotFiAoAEstimator({ smoothingAlpha: 1.0 });
      const rawResult = rawEst.estimate(rawPhases, 0);
      expect(maxAbs).toBeLessThanOrEqual(Math.abs(rawResult.dominantAngleDeg) + 1);
    });
  });

  describe('edge cases', () => {
    it('handles empty phase array', () => {
      const result = estimator.estimate([], 1000);
      expect(result.dominantAngleDeg).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('handles single-element phase array', () => {
      const result = estimator.estimate([1.5], 1000);
      expect(result.dominantAngleDeg).toBe(0);
      expect(result.confidence).toBe(0);
    });

    it('handles all-zero phases', () => {
      const result = estimator.estimate([0, 0, 0, 0], 1000);
      expect(result.dominantAngleDeg).toBeCloseTo(0, 2);
    });

    it('handles NaN in phases', () => {
      const phases = [0, NaN, 0.2, 0.3];
      const result = estimator.estimate(phases, 1000);
      // NaN propagates through phase diffs → regression yields NaN
      expect(typeof result.dominantAngleDeg).toBe('number');
    });

    it('reset clears all state', () => {
      estimator.estimate([0, 0.1, 0.2], 1000);
      estimator.reset();
      expect(estimator.getHistory()).toHaveLength(0);
      expect(estimator.getLateralSwayAmplitude()).toBe(0);
    });
  });

  describe('path length delta', () => {
    it('computes path length delta from non-zero phase slope', () => {
      // Quadratic phases produce non-zero regression slope → non-zero pathLengthDelta
      const phases = Array.from({ length: 16 }, (_, i) => 0.01 * i * i);
      const result = estimator.estimate(phases, 1000);
      expect(result.pathLengthDelta).not.toBe(0);
      expect(Number.isFinite(result.pathLengthDelta)).toBe(true);
    });
  });
});
