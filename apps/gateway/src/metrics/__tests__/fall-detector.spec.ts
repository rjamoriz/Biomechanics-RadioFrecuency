import { FallDetector, FallEvent } from '../fall-detector';

describe('FallDetector', () => {
  let detector: FallDetector;

  beforeEach(() => {
    detector = new FallDetector({
      varianceWindowMs: 500,
      spikeThresholdSigma: 3.0,
      stillnessRatio: 0.3,
      stillnessWindowMs: 2000,
      debouncePeriodMs: 10000,
      minBaselineSamples: 50,
    });
  });

  /** Feed N normal-running samples (moderate variance oscillation). */
  function feedBaseline(
    det: FallDetector,
    n: number,
    startMs = 0,
    intervalMs = 10,
  ): number {
    let ts = startMs;
    for (let i = 0; i < n; i++) {
      // Simulate running: sinusoidal amplitude with some noise
      const amplitude = 50 + 15 * Math.sin(i * 0.3) + Math.random() * 2;
      det.processSample(amplitude, ts);
      ts += intervalMs;
    }
    return ts;
  }

  describe('baseline establishment', () => {
    it('should return null during baseline build-up', () => {
      for (let i = 0; i < 30; i++) {
        const result = detector.processSample(50 + Math.random(), i * 10);
        expect(result).toBeNull();
      }
    });

    it('should not detect falls with insufficient data', () => {
      const result = detector.processSample(999, 0);
      expect(result).toBeNull();
    });
  });

  describe('fall detection — spike then stillness', () => {
    it('should detect a fall when spike is followed by stillness', () => {
      // Phase 1: establish running baseline (high variance)
      let ts = feedBaseline(detector, 100);

      // Phase 2: sudden spike (simulating impact)
      const spikeResult = detector.processSample(200, ts);
      ts += 10;

      // Phase 3: stillness (very low variance — person on ground)
      let fallEvent: FallEvent | null = null;
      for (let i = 0; i < 80; i++) {
        // Near-constant amplitude = low variance
        const result = detector.processSample(50.0 + Math.random() * 0.1, ts);
        if (result) fallEvent = result;
        ts += 10;
      }

      expect(fallEvent).not.toBeNull();
      expect(fallEvent!.alertLevel).toBeDefined();
      expect(['warning', 'critical']).toContain(fallEvent!.alertLevel);
      expect(fallEvent!.confidence).toBeGreaterThanOrEqual(0);
      expect(fallEvent!.confidence).toBeLessThanOrEqual(1);
      expect(fallEvent!.validationStatus).toBe('experimental');
      expect(fallEvent!.impactMagnitude).toBeGreaterThan(0);
    });

    it('should report pre and post impact variance', () => {
      let ts = feedBaseline(detector, 100);

      detector.processSample(250, ts);
      ts += 10;

      let fallEvent: FallEvent | null = null;
      for (let i = 0; i < 80; i++) {
        const result = detector.processSample(50 + Math.random() * 0.05, ts);
        if (result) fallEvent = result;
        ts += 10;
      }

      if (fallEvent) {
        expect(fallEvent.preImpactVariance).toBeGreaterThan(0);
        expect(fallEvent.postImpactVariance).toBeGreaterThanOrEqual(0);
        expect(fallEvent.postImpactVariance).toBeLessThan(
          fallEvent.preImpactVariance,
        );
      }
    });
  });

  describe('no false positives during normal running', () => {
    it('should not trigger on normal running variance', () => {
      let fallDetected = false;
      for (let i = 0; i < 500; i++) {
        const amplitude = 50 + 15 * Math.sin(i * 0.3) + Math.random() * 3;
        const result = detector.processSample(amplitude, i * 10);
        if (result) fallDetected = true;
      }
      expect(fallDetected).toBe(false);
    });

    it('should not trigger on gradual amplitude change', () => {
      let fallDetected = false;
      for (let i = 0; i < 500; i++) {
        // Slow drift in amplitude (e.g., speed change)
        const drift = i * 0.02;
        const amplitude =
          50 + drift + 10 * Math.sin(i * 0.3) + Math.random() * 2;
        const result = detector.processSample(amplitude, i * 10);
        if (result) fallDetected = true;
      }
      expect(fallDetected).toBe(false);
    });
  });

  describe('spike without stillness (not a fall)', () => {
    it('should not trigger if running resumes after spike', () => {
      let ts = feedBaseline(detector, 100);

      // Spike
      detector.processSample(200, ts);
      ts += 10;

      // Resume running (high variance continues)
      let fallDetected = false;
      for (let i = 0; i < 200; i++) {
        const amplitude = 50 + 15 * Math.sin(i * 0.3) + Math.random() * 3;
        const result = detector.processSample(amplitude, ts);
        if (result) fallDetected = true;
        ts += 10;
      }
      expect(fallDetected).toBe(false);
    });
  });

  describe('debounce', () => {
    it('should suppress repeated alerts within debounce window', () => {
      const fastDetector = new FallDetector({
        varianceWindowMs: 300,
        debouncePeriodMs: 5000,
        minBaselineSamples: 30,
        stillnessWindowMs: 3000,
        stillnessRatio: 0.3,
        spikeThresholdSigma: 3.0,
      });

      let ts = feedBaseline(fastDetector, 60, 0, 10);

      // First fall
      fastDetector.processSample(250, ts);
      ts += 10;
      let firstFall: FallEvent | null = null;
      for (let i = 0; i < 120; i++) {
        const r = fastDetector.processSample(50 + Math.random() * 0.1, ts);
        if (r) firstFall = r;
        ts += 10;
      }

      // Second spike immediately after (within debounce)
      fastDetector.processSample(250, ts);
      ts += 10;
      let secondFall: FallEvent | null = null;
      for (let i = 0; i < 120; i++) {
        const r = fastDetector.processSample(50 + Math.random() * 0.1, ts);
        if (r) secondFall = r;
        ts += 10;
      }

      // First should fire, second should be debounced
      expect(firstFall).not.toBeNull();
      expect(secondFall).toBeNull();
    });
  });

  describe('reset', () => {
    it('should clear all state on reset', () => {
      feedBaseline(detector, 100);
      detector.reset();

      // Should need to re-establish baseline
      const result = detector.processSample(999, 0);
      expect(result).toBeNull();
    });
  });

  describe('output contract', () => {
    it('should always set validationStatus to experimental', () => {
      let ts = feedBaseline(detector, 100);
      detector.processSample(300, ts);
      ts += 10;

      let event: FallEvent | null = null;
      for (let i = 0; i < 80; i++) {
        const r = detector.processSample(50 + Math.random() * 0.05, ts);
        if (r) event = r;
        ts += 10;
      }

      if (event) {
        expect(event.validationStatus).toBe('experimental');
        expect(event.timestamp).toBeGreaterThan(0);
      }
    });
  });
});
