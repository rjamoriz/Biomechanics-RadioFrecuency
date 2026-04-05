import { VerticalOscillationEstimator } from '../vertical-oscillation-estimator';

describe('VerticalOscillationEstimator', () => {
  let estimator: VerticalOscillationEstimator;

  beforeEach(() => {
    estimator = new VerticalOscillationEstimator({
      maxBufferSize: 500,
      scalingFactor: 1.0,
      sampleRateHz: 100,
    });
  });

  describe('initialization', () => {
    it('should create with default options', () => {
      const e = new VerticalOscillationEstimator();
      expect(e).toBeDefined();
    });

    it('should return null with insufficient data', () => {
      expect(estimator.estimate()).toBeNull();
    });
  });

  describe('happy path — oscillating signal', () => {
    it('should estimate vertical oscillation from sinusoidal amplitude', () => {
      // Simulate 2 seconds of ~2.5 Hz oscillation at 100 Hz sample rate
      for (let i = 0; i < 200; i++) {
        const t = i / 100;
        const amplitude = 20 + 3 * Math.sin(2 * Math.PI * 2.5 * t);
        estimator.addSample(amplitude);
      }

      const result = estimator.estimate(0.8);
      expect(result).not.toBeNull();
      expect(result!.verticalOscillationCm).toBeGreaterThan(0);
      expect(result!.rawAmplitude).toBeGreaterThan(0);
      expect(result!.scalingFactor).toBe(1.0);
      expect(result!.validationStatus).toBe('experimental');
      expect(result!.confidence).toBeGreaterThan(0);
      expect(result!.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('always experimental', () => {
    it('should always have experimental validation status', () => {
      for (let i = 0; i < 100; i++) {
        estimator.addSample(10 + Math.sin(i * 0.2) * 3);
      }
      const result = estimator.estimate();
      if (result) {
        expect(result.validationStatus).toBe('experimental');
      }
    });
  });

  describe('scaling factor', () => {
    it('should apply station-specific scaling factor', () => {
      const calibrated = new VerticalOscillationEstimator({
        scalingFactor: 2.5,
        sampleRateHz: 100,
      });

      for (let i = 0; i < 200; i++) {
        const t = i / 100;
        calibrated.addSample(20 + 3 * Math.sin(2 * Math.PI * 2.5 * t));
      }

      const result = calibrated.estimate(0.9);
      expect(result).not.toBeNull();
      expect(result!.scalingFactor).toBe(2.5);
    });

    it('should update scaling factor via setter', () => {
      estimator.setScalingFactor(3.0);

      for (let i = 0; i < 200; i++) {
        estimator.addSample(20 + 3 * Math.sin(2 * Math.PI * 2.5 * (i / 100)));
      }

      const result = estimator.estimate();
      expect(result).not.toBeNull();
      expect(result!.scalingFactor).toBe(3.0);
    });

    it('should ignore invalid (zero/negative) scaling factor', () => {
      estimator.setScalingFactor(0);
      for (let i = 0; i < 100; i++) {
        estimator.addSample(10 + Math.sin(i * 0.2) * 3);
      }
      const result = estimator.estimate();
      if (result) {
        expect(result.scalingFactor).toBe(1.0);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle all-constant signal', () => {
      for (let i = 0; i < 100; i++) {
        estimator.addSample(10);
      }
      const result = estimator.estimate();
      // Flat signal → no oscillation detected
      expect(result).toBeNull();
    });

    it('should handle very noisy signal', () => {
      for (let i = 0; i < 200; i++) {
        estimator.addSample(Math.random() * 100);
      }
      // Should not throw
      expect(() => estimator.estimate()).not.toThrow();
    });

    it('should return null with exactly 59 samples (below minimum)', () => {
      for (let i = 0; i < 59; i++) {
        estimator.addSample(10 + Math.sin(i * 0.3) * 3);
      }
      expect(estimator.estimate()).toBeNull();
    });
  });

  describe('reset', () => {
    it('should clear buffer on reset', () => {
      for (let i = 0; i < 100; i++) {
        estimator.addSample(10 + Math.sin(i * 0.2) * 3);
      }
      estimator.reset();
      expect(estimator.estimate()).toBeNull();
    });
  });

  describe('confidence scoring', () => {
    it('should penalise uncalibrated (default scaling factor)', () => {
      for (let i = 0; i < 200; i++) {
        estimator.addSample(20 + 3 * Math.sin(2 * Math.PI * 2.5 * (i / 100)));
      }

      const uncalibrated = estimator.estimate(1.0);

      const calibrated = new VerticalOscillationEstimator({
        scalingFactor: 2.0,
        sampleRateHz: 100,
      });
      for (let i = 0; i < 200; i++) {
        calibrated.addSample(20 + 3 * Math.sin(2 * Math.PI * 2.5 * (i / 100)));
      }
      const calibratedResult = calibrated.estimate(1.0);

      if (uncalibrated && calibratedResult) {
        expect(calibratedResult.confidence).toBeGreaterThanOrEqual(
          uncalibrated.confidence,
        );
      }
    });
  });
});
