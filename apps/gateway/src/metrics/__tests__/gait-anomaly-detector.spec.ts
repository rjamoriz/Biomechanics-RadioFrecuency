import {
  GaitAnomalyDetector,
  GaitMetricsSample,
  GaitAnomaly,
} from '../gait-anomaly-detector';

describe('GaitAnomalyDetector', () => {
  let detector: GaitAnomalyDetector;

  /** Normal running sample with small noise. */
  function normalSample(ts: number): GaitMetricsSample {
    return {
      cadence: 170 + Math.random() * 2 - 1,
      stepIntervalCV: 0.04 + Math.random() * 0.005,
      asymmetry: 0.05 + Math.random() * 0.01,
      contactTimeMs: 250 + Math.random() * 5,
      timestampMs: ts,
    };
  }

  beforeEach(() => {
    detector = new GaitAnomalyDetector({
      zScoreThreshold: 2.5,
      minBaselineStrides: 30,
      maxBaselineWindow: 200,
    });
  });

  describe('baseline establishment', () => {
    it('should not detect anomalies during baseline period', () => {
      for (let i = 0; i < 30; i++) {
        const anomalies = detector.processSample(normalSample(i * 350));
        expect(anomalies).toHaveLength(0);
      }
    });

    it('should track stride count', () => {
      for (let i = 0; i < 10; i++) {
        detector.processSample(normalSample(i * 350));
      }
      expect(detector.getStrideCount()).toBe(10);
    });

    it('should report baseline not ready before min strides', () => {
      for (let i = 0; i < 20; i++) {
        detector.processSample(normalSample(i * 350));
      }
      expect(detector.isBaselineReady()).toBe(false);
    });

    it('should report baseline ready after min strides', () => {
      for (let i = 0; i < 31; i++) {
        detector.processSample(normalSample(i * 350));
      }
      expect(detector.isBaselineReady()).toBe(true);
    });
  });

  describe('cadence anomalies', () => {
    it('should detect cadence_drop', () => {
      // Build baseline
      for (let i = 0; i < 40; i++) {
        detector.processSample(normalSample(i * 350));
      }

      // Inject sudden cadence drop
      const anomalies = detector.processSample({
        cadence: 130, // way below baseline ~170
        stepIntervalCV: 0.04,
        asymmetry: 0.05,
        contactTimeMs: 250,
        timestampMs: 40 * 350,
      });

      const cadenceAnomaly = anomalies.find((a) => a.type === 'cadence_drop');
      expect(cadenceAnomaly).toBeDefined();
      expect(cadenceAnomaly!.metric).toBe('cadence');
      expect(cadenceAnomaly!.zScore).toBeLessThan(0);
      expect(cadenceAnomaly!.validationStatus).toBe('experimental');
    });

    it('should detect cadence_spike', () => {
      for (let i = 0; i < 40; i++) {
        detector.processSample(normalSample(i * 350));
      }

      const anomalies = detector.processSample({
        cadence: 220, // way above baseline ~170
        stepIntervalCV: 0.04,
        asymmetry: 0.05,
        contactTimeMs: 250,
        timestampMs: 40 * 350,
      });

      const cadenceAnomaly = anomalies.find((a) => a.type === 'cadence_spike');
      expect(cadenceAnomaly).toBeDefined();
      expect(cadenceAnomaly!.zScore).toBeGreaterThan(0);
    });
  });

  describe('asymmetry anomaly', () => {
    it('should detect asymmetry_increase', () => {
      for (let i = 0; i < 40; i++) {
        detector.processSample(normalSample(i * 350));
      }

      const anomalies = detector.processSample({
        cadence: 170,
        stepIntervalCV: 0.04,
        asymmetry: 0.5, // huge jump from baseline ~0.05
        contactTimeMs: 250,
        timestampMs: 40 * 350,
      });

      const asymAnomaly = anomalies.find(
        (a) => a.type === 'asymmetry_increase',
      );
      expect(asymAnomaly).toBeDefined();
      expect(asymAnomaly!.severity).toBeDefined();
      expect(['mild', 'moderate', 'severe']).toContain(asymAnomaly!.severity);
    });
  });

  describe('variability anomaly', () => {
    it('should detect variability_increase', () => {
      for (let i = 0; i < 40; i++) {
        detector.processSample(normalSample(i * 350));
      }

      const anomalies = detector.processSample({
        cadence: 170,
        stepIntervalCV: 0.3, // big jump from baseline ~0.04
        asymmetry: 0.05,
        contactTimeMs: 250,
        timestampMs: 40 * 350,
      });

      const varAnomaly = anomalies.find(
        (a) => a.type === 'variability_increase',
      );
      expect(varAnomaly).toBeDefined();
    });
  });

  describe('form degradation composite', () => {
    it('should detect form_degradation when multiple metrics are anomalous', () => {
      for (let i = 0; i < 40; i++) {
        detector.processSample(normalSample(i * 350));
      }

      const anomalies = detector.processSample({
        cadence: 130, // anomalous
        stepIntervalCV: 0.3, // anomalous
        asymmetry: 0.5, // anomalous
        contactTimeMs: 350, // anomalous
        timestampMs: 40 * 350,
      });

      const formAnomaly = anomalies.find((a) => a.type === 'form_degradation');
      expect(formAnomaly).toBeDefined();
      expect(formAnomaly!.metric).toBe('composite');
      expect(formAnomaly!.validationStatus).toBe('experimental');
    });
  });

  describe('no false positives on stable metrics', () => {
    it('should not flag anomalies for normal running after baseline', () => {
      // Build baseline
      for (let i = 0; i < 40; i++) {
        detector.processSample(normalSample(i * 350));
      }

      // Continue with normal running
      let totalAnomalies = 0;
      for (let i = 40; i < 100; i++) {
        const anomalies = detector.processSample(normalSample(i * 350));
        totalAnomalies += anomalies.length;
      }

      // Some statistical noise may cause occasional triggers, but should be rare
      expect(totalAnomalies).toBeLessThan(5);
    });
  });

  describe('output contract', () => {
    it('should include all required fields on anomaly', () => {
      for (let i = 0; i < 40; i++) {
        detector.processSample(normalSample(i * 350));
      }

      const anomalies = detector.processSample({
        cadence: 100,
        stepIntervalCV: 0.04,
        asymmetry: 0.05,
        contactTimeMs: 250,
        timestampMs: 40 * 350,
      });

      expect(anomalies.length).toBeGreaterThan(0);
      const a = anomalies[0];
      expect(typeof a.type).toBe('string');
      expect(typeof a.metric).toBe('string');
      expect(typeof a.currentValue).toBe('number');
      expect(typeof a.baselineMean).toBe('number');
      expect(typeof a.baselineStd).toBe('number');
      expect(typeof a.zScore).toBe('number');
      expect(typeof a.timestamp).toBe('number');
      expect(typeof a.severity).toBe('string');
      expect(typeof a.message).toBe('string');
      expect(typeof a.confidence).toBe('number');
      expect(a.confidence).toBeGreaterThanOrEqual(0);
      expect(a.confidence).toBeLessThanOrEqual(1);
      expect(a.validationStatus).toBe('experimental');
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      for (let i = 0; i < 40; i++) {
        detector.processSample(normalSample(i * 350));
      }
      expect(detector.isBaselineReady()).toBe(true);

      detector.reset();

      expect(detector.isBaselineReady()).toBe(false);
      expect(detector.getStrideCount()).toBe(0);
    });
  });
});
