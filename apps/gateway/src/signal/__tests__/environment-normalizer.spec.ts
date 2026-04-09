import {
  EnvironmentNormalizer,
  AdaptiveNormalizer,
  EnvironmentBaseline,
} from '../../signal/environment-normalizer';

// ─── Helpers ────────────────────────────────────────────────────────

function makeBaseline(overrides?: Partial<EnvironmentBaseline>): EnvironmentBaseline {
  return {
    noiseFloor: 0.5,
    ambientMean: [10, 20, 30],
    ambientVariance: [1, 4, 9],
    capturedAt: Date.now(),
    subcarrierCount: 3,
    ...overrides,
  };
}

// ─── EnvironmentNormalizer ──────────────────────────────────────────

describe('EnvironmentNormalizer', () => {
  it('should throw when normalizing without baseline', () => {
    const norm = new EnvironmentNormalizer();
    expect(() => norm.normalize([1, 2, 3])).toThrow(/baseline/i);
  });

  it('should report hasBaseline correctly', () => {
    const norm = new EnvironmentNormalizer();
    expect(norm.hasBaseline()).toBe(false);
    norm.setBaseline(makeBaseline());
    expect(norm.hasBaseline()).toBe(true);
  });

  it('should return a copy of the baseline via getBaseline', () => {
    const norm = new EnvironmentNormalizer();
    expect(norm.getBaseline()).toBeNull();

    const bl = makeBaseline();
    norm.setBaseline(bl);
    const got = norm.getBaseline()!;
    expect(got.ambientMean).toEqual(bl.ambientMean);
    // Verify it's a copy, not the same reference
    expect(got.ambientMean).not.toBe(bl.ambientMean);
  });

  it('should subtract baseline mean from raw subcarriers', () => {
    const norm = new EnvironmentNormalizer();
    norm.setBaseline(makeBaseline({ ambientMean: [10, 20, 30], ambientVariance: [100, 100, 100] }));

    const result = norm.normalize([15, 25, 35]);
    expect(result.normalized).toEqual([5, 5, 5]);
    expect(result.clipped).toBe(false);
  });

  it('should clip outliers beyond 3 sigma', () => {
    const norm = new EnvironmentNormalizer();
    // variance = 1 → sigma = 1 → clip at ±3
    norm.setBaseline(makeBaseline({ ambientMean: [10], ambientVariance: [1], subcarrierCount: 1 }));

    const result = norm.normalize([20]); // diff = 10 > 3*1 = 3
    expect(result.clipped).toBe(true);
    // Clipped to 3
    expect(result.normalized[0]).toBeCloseTo(3, 3);
  });

  it('should clip negative outliers', () => {
    const norm = new EnvironmentNormalizer();
    norm.setBaseline(makeBaseline({ ambientMean: [10], ambientVariance: [1], subcarrierCount: 1 }));

    const result = norm.normalize([0]); // diff = -10 > 3 sigma
    expect(result.clipped).toBe(true);
    expect(result.normalized[0]).toBeCloseTo(-3, 3);
  });

  it('should compute quality as SNR-like ratio', () => {
    const norm = new EnvironmentNormalizer();
    // Large variance → low quality; small signal
    norm.setBaseline(makeBaseline({ ambientMean: [10], ambientVariance: [100], subcarrierCount: 1 }));
    const lowQ = norm.normalize([11]); // signal = 1^2 = 1, noise = 100
    expect(lowQ.quality).toBeLessThan(0.1);

    // Small variance → high quality; large signal
    norm.setBaseline(makeBaseline({ ambientMean: [10], ambientVariance: [0.01], subcarrierCount: 1 }));
    const highQ = norm.normalize([15]); // signal = clipped but still large vs 0.01
    expect(highQ.quality).toBeGreaterThan(0.5);
  });

  it('should handle zero-variance baseline gracefully', () => {
    const norm = new EnvironmentNormalizer();
    norm.setBaseline(makeBaseline({ ambientMean: [10], ambientVariance: [0], subcarrierCount: 1 }));

    // Should not throw; uses epsilon floor for variance
    const result = norm.normalize([10.001]);
    expect(result.normalized).toHaveLength(1);
  });

  it('should handle mismatched subcarrier lengths', () => {
    const norm = new EnvironmentNormalizer();
    norm.setBaseline(makeBaseline({ ambientMean: [10, 20], ambientVariance: [1, 1], subcarrierCount: 2 }));

    // Longer input — normalizes only overlapping subcarriers
    const result = norm.normalize([15, 25, 999]);
    expect(result.normalized).toHaveLength(2);
  });
});

// ─── AdaptiveNormalizer ─────────────────────────────────────────────

describe('AdaptiveNormalizer', () => {
  it('should inherit parent normalize behavior', () => {
    const norm = new AdaptiveNormalizer(0.1);
    norm.setBaseline(makeBaseline({ ambientMean: [10], ambientVariance: [100], subcarrierCount: 1 }));

    const result = norm.normalize([15]);
    expect(result.normalized[0]).toBeCloseTo(5, 3);
  });

  it('should adapt baseline over successive normalizations', () => {
    const norm = new AdaptiveNormalizer(0.5); // fast adaptation for testing
    norm.setBaseline(makeBaseline({ ambientMean: [10], ambientVariance: [4], subcarrierCount: 1 }));

    // First normalize: baseline mean = 10, raw = 20 → diff = 10
    norm.normalize([20]);
    // Baseline should have shifted toward 20
    const bl1 = norm.getBaseline()!;
    expect(bl1.ambientMean[0]).toBeGreaterThan(10);
    expect(bl1.ambientMean[0]).toBeLessThan(20);

    // Second normalize: continues shifting
    norm.normalize([20]);
    const bl2 = norm.getBaseline()!;
    expect(bl2.ambientMean[0]).toBeGreaterThan(bl1.ambientMean[0]);
  });

  it('should report adaptation progress starting at 0', () => {
    const norm = new AdaptiveNormalizer(0.1);
    expect(norm.getAdaptationProgress()).toBe(0);

    norm.setBaseline(makeBaseline({ ambientMean: [10], ambientVariance: [1], subcarrierCount: 1 }));
    expect(norm.getAdaptationProgress()).toBe(0);
  });

  it('should increase adaptation progress as baseline drifts', () => {
    const norm = new AdaptiveNormalizer(0.3);
    norm.setBaseline(makeBaseline({ ambientMean: [10, 20], ambientVariance: [1, 1], subcarrierCount: 2 }));

    for (let i = 0; i < 20; i++) {
      norm.normalize([50, 60]); // push baseline upward
    }

    const progress = norm.getAdaptationProgress();
    expect(progress).toBeGreaterThan(0);
    expect(progress).toBeLessThanOrEqual(1);
  });

  it('should clamp adaptation rate to [0, 1]', () => {
    const norm = new AdaptiveNormalizer(5.0); // clamped to 1
    norm.setBaseline(makeBaseline({ ambientMean: [10], ambientVariance: [1], subcarrierCount: 1 }));
    // Should not throw
    const result = norm.normalize([20]);
    expect(result.normalized).toHaveLength(1);
  });

  it('should reset adaptation progress when new baseline is set', () => {
    const norm = new AdaptiveNormalizer(0.3);
    norm.setBaseline(makeBaseline({ ambientMean: [10], ambientVariance: [1], subcarrierCount: 1 }));
    norm.normalize([50]);
    norm.normalize([50]);
    expect(norm.getAdaptationProgress()).toBeGreaterThan(0);

    // Reset with new baseline
    norm.setBaseline(makeBaseline({ ambientMean: [10], ambientVariance: [1], subcarrierCount: 1 }));
    expect(norm.getAdaptationProgress()).toBe(0);
  });
});
