import {
  AdaptiveOnlineClassifier,
  DEFAULT_WARMUP_FRAMES,
  DEFAULT_ANOMALY_THRESHOLD,
  DEFAULT_DRIFT_WINDOW,
  METRICS_TO_TRACK,
} from '../../src/signal/adaptive-classifier';

const BASE_METRICS: Record<string, number> = {
  estimatedCadence: 170,
  stepIntervalEstimate: 0.35,
  symmetryProxy: 0.95,
  contactTimeProxy: 0.22,
  flightTimeProxy: 0.13,
  fatigueDriftScore: 0.05,
};

function pushNFrames(
  classifier: AdaptiveOnlineClassifier,
  n: number,
  overrides: Record<string, number> = {},
  addNoise = false,
): void {
  for (let i = 0; i < n; i++) {
    const noise = addNoise ? Math.sin(i * 0.7) * 2 : 0;
    classifier.classify(
      { ...BASE_METRICS, estimatedCadence: BASE_METRICS.estimatedCadence + noise, ...overrides },
      1000 + i * 100,
    );
  }
}

describe('AdaptiveOnlineClassifier', () => {
  let classifier: AdaptiveOnlineClassifier;

  beforeEach(() => {
    classifier = new AdaptiveOnlineClassifier('athlete-1');
  });

  describe('warmup phase', () => {
    it('starts not ready', () => {
      expect(classifier.isReady()).toBe(false);
    });

    it('reports warmup progress', () => {
      pushNFrames(classifier, 100);
      const progress = classifier.getWarmupProgress();
      expect(progress).toBeCloseTo(100 / DEFAULT_WARMUP_FRAMES, 2);
    });

    it('becomes ready after warmup frames', () => {
      pushNFrames(classifier, DEFAULT_WARMUP_FRAMES);
      expect(classifier.isReady()).toBe(true);
    });

    it('reports 1.0 progress when fully warmed up', () => {
      pushNFrames(classifier, DEFAULT_WARMUP_FRAMES);
      expect(classifier.getWarmupProgress()).toBe(1);
    });

    it('classify returns baselineEstablished=false during warmup', () => {
      const result = classifier.classify({ ...BASE_METRICS }, 1000);
      expect(result.baselineEstablished).toBe(false);
      expect(result.warmupProgress).toBeGreaterThan(0);
    });
  });

  describe('baseline and z-score', () => {
    it('establishes baseline after warmup', () => {
      pushNFrames(classifier, DEFAULT_WARMUP_FRAMES);
      const profile = classifier.exportProfile();
      expect(profile.isWarmupComplete).toBe(true);
      expect(profile.metricBaselines['estimatedCadence']).toBeDefined();
      expect(profile.metricBaselines['estimatedCadence'].mean).toBeCloseTo(170, 0);
    });

    it('computes deviation metrics after warmup', () => {
      pushNFrames(classifier, DEFAULT_WARMUP_FRAMES);
      const result = classifier.classify(
        { ...BASE_METRICS, estimatedCadence: 175 },
        Date.now(),
      );
      expect(result.baselineEstablished).toBe(true);
      expect(result.deviations['estimatedCadence']).toBeDefined();
      expect(typeof result.deviations['estimatedCadence'].zScore).toBe('number');
    });

    it('returns small z-scores for in-pattern values', () => {
      pushNFrames(classifier, DEFAULT_WARMUP_FRAMES);
      const result = classifier.classify({ ...BASE_METRICS }, Date.now());
      for (const metric of METRICS_TO_TRACK) {
        expect(Math.abs(result.deviations[metric].zScore)).toBeLessThan(1);
      }
    });
  });

  describe('anomaly detection', () => {
    it('flags anomaly when value deviates beyond threshold', () => {
      // Use noisy warmup so std > 0
      pushNFrames(classifier, DEFAULT_WARMUP_FRAMES, {}, true);
      const result = classifier.classify(
        { ...BASE_METRICS, estimatedCadence: 250 },
        Date.now(),
      );
      expect(result.deviations['estimatedCadence'].isAnomaly).toBe(true);
      expect(result.overallAnomalyScore).toBeGreaterThan(0);
    });

    it('does not flag normal variation as anomaly', () => {
      pushNFrames(classifier, DEFAULT_WARMUP_FRAMES);
      const result = classifier.classify({ ...BASE_METRICS }, Date.now());
      for (const metric of METRICS_TO_TRACK) {
        expect(result.deviations[metric].isAnomaly).toBe(false);
      }
    });

    it('classifies deviation direction', () => {
      pushNFrames(classifier, DEFAULT_WARMUP_FRAMES, {}, true);
      const above = classifier.classify(
        { ...BASE_METRICS, estimatedCadence: 250 },
        Date.now(),
      );
      expect(above.deviations['estimatedCadence'].direction).toBe('above');
    });
  });

  describe('profile export/import', () => {
    it('exports profile even before warmup complete', () => {
      pushNFrames(classifier, 10);
      const profile = classifier.exportProfile();
      expect(profile.athleteId).toBe('athlete-1');
      expect(profile.isWarmupComplete).toBe(false);
    });

    it('exports valid profile after warmup', () => {
      pushNFrames(classifier, DEFAULT_WARMUP_FRAMES);
      const profile = classifier.exportProfile();
      expect(profile.isWarmupComplete).toBe(true);
      expect(profile.warmupFrames).toBe(DEFAULT_WARMUP_FRAMES);
      for (const metric of METRICS_TO_TRACK) {
        expect(profile.metricBaselines[metric]).toBeDefined();
        expect(typeof profile.metricBaselines[metric].mean).toBe('number');
        expect(typeof profile.metricBaselines[metric].std).toBe('number');
      }
    });

    it('restores classifier state from imported profile', () => {
      pushNFrames(classifier, DEFAULT_WARMUP_FRAMES, {}, true);
      const profile = classifier.exportProfile();

      const restored = new AdaptiveOnlineClassifier('athlete-1');
      restored.importProfile(profile);
      expect(restored.isReady()).toBe(true);

      const result = restored.classify(
        { ...BASE_METRICS, estimatedCadence: 250 },
        Date.now(),
      );
      expect(result.deviations['estimatedCadence'].isAnomaly).toBe(true);
    });
  });

  describe('drift detection', () => {
    it('detects drift when metric trends over time', () => {
      pushNFrames(classifier, DEFAULT_WARMUP_FRAMES);

      for (let i = 0; i < DEFAULT_DRIFT_WINDOW; i++) {
        classifier.classify(
          { ...BASE_METRICS, estimatedCadence: 170 + i * 0.05 },
          Date.now() + i * 100,
        );
      }

      const result = classifier.classify(
        { ...BASE_METRICS, estimatedCadence: 170 + DEFAULT_DRIFT_WINDOW * 0.05 },
        Date.now() + DEFAULT_DRIFT_WINDOW * 100,
      );
      expect(result.sessionDrift['estimatedCadence']).toBeGreaterThan(0);
    });

    it('reports near-zero drift when stable', () => {
      pushNFrames(classifier, DEFAULT_WARMUP_FRAMES);
      pushNFrames(classifier, DEFAULT_DRIFT_WINDOW);

      const result = classifier.classify({ ...BASE_METRICS }, Date.now());
      expect(Math.abs(result.sessionDrift['estimatedCadence'])).toBeLessThan(0.01);
    });
  });

  describe('reset', () => {
    it('resets to pre-warmup state', () => {
      pushNFrames(classifier, DEFAULT_WARMUP_FRAMES);
      expect(classifier.isReady()).toBe(true);
      classifier.reset();
      expect(classifier.isReady()).toBe(false);
      expect(classifier.getWarmupProgress()).toBe(0);
    });
  });

  describe('custom config', () => {
    it('accepts custom warmup frames', () => {
      const quick = new AdaptiveOnlineClassifier('athlete-2', { warmupFrames: 10 });
      pushNFrames(quick, 10);
      expect(quick.isReady()).toBe(true);
    });

    it('accepts custom anomaly threshold', () => {
      const sensitive = new AdaptiveOnlineClassifier('athlete-3', {
        warmupFrames: 50,
        anomalyThreshold: 0.5,
      });
      pushNFrames(sensitive, 50);
      const result = sensitive.classify(
        { ...BASE_METRICS, estimatedCadence: 175 },
        Date.now(),
      );
      expect(result.baselineEstablished).toBe(true);
    });
  });
});
