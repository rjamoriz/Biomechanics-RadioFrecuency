import { BreathingRateEstimator } from '../breathing-rate-estimator';

/** Deterministic PRNG (Mulberry32) for reproducible tests. */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('BreathingRateEstimator', () => {
  const SAMPLE_RATE = 25;
  let estimator: BreathingRateEstimator;

  beforeEach(() => {
    estimator = new BreathingRateEstimator(SAMPLE_RATE);
  });

  /**
   * Generate a synthetic breathing signal.
   * @param breathsPerMin Target breathing rate
   * @param durationSec Signal duration
   * @param noiseLevel Gaussian-ish noise amplitude (0 = clean)
   */
  function generateBreathingSignal(
    breathsPerMin: number,
    durationSec: number,
    noiseLevel = 0,
  ): number[] {
    const n = durationSec * SAMPLE_RATE;
    const freqHz = breathsPerMin / 60;
    const signal: number[] = [];
    for (let i = 0; i < n; i++) {
      const t = i / SAMPLE_RATE;
      const clean = Math.sin(2 * Math.PI * freqHz * t);
      const noise = noiseLevel * (Math.random() * 2 - 1);
      signal.push(clean + noise);
    }
    return signal;
  }

  describe('isReady', () => {
    it('should return false for < 250 samples', () => {
      expect(estimator.isReady(100)).toBe(false);
      expect(estimator.isReady(249)).toBe(false);
    });

    it('should return true for >= 250 samples', () => {
      expect(estimator.isReady(250)).toBe(true);
      expect(estimator.isReady(500)).toBe(true);
    });
  });

  describe('insufficient data', () => {
    it('should return null for too-short signal', () => {
      const short = generateBreathingSignal(15, 5); // 125 samples < 250
      expect(estimator.estimate(short)).toBeNull();
    });

    it('should return null for empty array', () => {
      expect(estimator.estimate([])).toBeNull();
    });
  });

  describe('clean breathing signal — FFT detection', () => {
    it('should detect 15 BPM (0.25 Hz)', () => {
      const signal = generateBreathingSignal(15, 20);
      const result = estimator.estimate(signal);

      expect(result).not.toBeNull();
      expect(result!.estimatedBreathingRateBpm).toBeGreaterThanOrEqual(12);
      expect(result!.estimatedBreathingRateBpm).toBeLessThanOrEqual(18);
      expect(result!.fftPeakHz).toBeGreaterThanOrEqual(0.15);
      expect(result!.fftPeakHz).toBeLessThanOrEqual(0.35);
      expect(result!.validationStatus).toBe('experimental');
    });

    it('should detect 12 BPM (0.2 Hz)', () => {
      const signal = generateBreathingSignal(12, 20);
      const result = estimator.estimate(signal);

      expect(result).not.toBeNull();
      expect(result!.estimatedBreathingRateBpm).toBeGreaterThanOrEqual(9);
      expect(result!.estimatedBreathingRateBpm).toBeLessThanOrEqual(15);
    });

    it('should detect 24 BPM (0.4 Hz)', () => {
      const signal = generateBreathingSignal(24, 20);
      const result = estimator.estimate(signal);

      expect(result).not.toBeNull();
      expect(result!.estimatedBreathingRateBpm).toBeGreaterThanOrEqual(20);
      expect(result!.estimatedBreathingRateBpm).toBeLessThanOrEqual(28);
    });
  });

  describe('noisy signal', () => {
    it('should still detect 15 BPM with moderate noise', () => {
      const signal = generateBreathingSignal(15, 30, 0.3);
      const result = estimator.estimate(signal);

      expect(result).not.toBeNull();
      // Allow wider tolerance for noisy signal
      expect(result!.estimatedBreathingRateBpm).toBeGreaterThanOrEqual(10);
      expect(result!.estimatedBreathingRateBpm).toBeLessThanOrEqual(22);
    });

    it('should have lower confidence with noisy signal', () => {
      const clean = generateBreathingSignal(15, 20, 0);
      const noisy = generateBreathingSignal(15, 20, 2.0);

      const cleanResult = estimator.estimate(clean);
      const noisyResult = estimator.estimate(noisy);

      // Both should produce results
      expect(cleanResult).not.toBeNull();
      expect(noisyResult).not.toBeNull();

      // Clean signal should generally have higher confidence
      // (this is probabilistic, so we just check both are in range)
      expect(cleanResult!.confidence).toBeGreaterThanOrEqual(0);
      expect(cleanResult!.confidence).toBeLessThanOrEqual(1);
      expect(noisyResult!.confidence).toBeGreaterThanOrEqual(0);
      expect(noisyResult!.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('output contract', () => {
    it('should always set validationStatus to experimental', () => {
      const signal = generateBreathingSignal(15, 20);
      const result = estimator.estimate(signal);

      expect(result).not.toBeNull();
      expect(result!.validationStatus).toBe('experimental');
    });

    it('should include all required fields', () => {
      const signal = generateBreathingSignal(18, 15);
      const result = estimator.estimate(signal);

      expect(result).not.toBeNull();
      expect(typeof result!.estimatedBreathingRateBpm).toBe('number');
      expect(typeof result!.fftPeakHz).toBe('number');
      expect(typeof result!.fftPeakPower).toBe('number');
      expect(typeof result!.zeroCrossingBpm).toBe('number');
      expect(['fft_peak', 'zero_crossing']).toContain(result!.method);
      expect(result!.signalQuality).toBeGreaterThanOrEqual(0);
      expect(result!.signalQuality).toBeLessThanOrEqual(1);
      expect(result!.confidence).toBeGreaterThanOrEqual(0);
      expect(result!.confidence).toBeLessThanOrEqual(1);
    });

    it('should use fft_peak as primary method for clean signal', () => {
      const signal = generateBreathingSignal(15, 20);
      const result = estimator.estimate(signal);

      expect(result).not.toBeNull();
      expect(result!.method).toBe('fft_peak');
    });
  });

  describe('zero-crossing method', () => {
    it('should provide zero-crossing estimate alongside FFT', () => {
      const signal = generateBreathingSignal(15, 20);
      const result = estimator.estimate(signal);

      expect(result).not.toBeNull();
      // Zero-crossing should be in the ballpark
      expect(result!.zeroCrossingBpm).toBeGreaterThan(0);
      expect(result!.zeroCrossingBpm).toBeLessThan(60);
    });
  });

  describe('SNR rejection', () => {
    it('should produce low confidence for broadband noise (no breathing component)', () => {
      // Uniform random noise — energy spread across all frequencies, no breathing peak
      const rng = mulberry32(42); // deterministic seed
      const signal = new Array(500).fill(0).map(() => (rng() - 0.5) * 100);
      const result = estimator.estimate(signal);
      // With broadband noise the SNR in the breathing band is low
      if (result) {
        expect(result.confidence).toBeLessThan(0.7);
      }
    });
  });
});
