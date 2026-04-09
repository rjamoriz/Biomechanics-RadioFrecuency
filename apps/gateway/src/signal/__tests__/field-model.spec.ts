import {
  StationFieldModel,
  FieldModelManager,
  FieldModelConfig,
} from '../../signal/field-model';

// ─── Helpers ────────────────────────────────────────────────────────

/** Build a fake CSI frame with N subcarriers around a base value */
function makeFrame(
  n: number,
  base: number,
  noise = 0,
  timestamp = Date.now(),
): { subcarriers: number[]; timestamp: number } {
  const subcarriers = Array.from({ length: n }, (_, i) =>
    base + i * 0.1 + (Math.random() - 0.5) * noise,
  );
  return { subcarriers, timestamp };
}

const BASE_CONFIG: Partial<FieldModelConfig> = {
  decayFactor: 0.1,
  minSamplesForModel: 5,
  staleThresholdMs: 1000,
};

// ─── StationFieldModel ─────────────────────────────────────────────

describe('StationFieldModel', () => {
  it('should start with zero sample count', () => {
    const model = new StationFieldModel('s1', BASE_CONFIG);
    const profile = model.getExpectedProfile();
    expect(profile.sampleCount).toBe(0);
    expect(profile.quality).toBe('insufficient');
    expect(profile.mean).toHaveLength(0);
  });

  it('should initialize EMA mean to first frame', () => {
    const model = new StationFieldModel('s1', BASE_CONFIG);
    const frame = { subcarriers: [10, 20, 30], timestamp: 1000 };
    model.update(frame);

    const profile = model.getExpectedProfile();
    expect(profile.mean).toEqual([10, 20, 30]);
    expect(profile.sampleCount).toBe(1);
    expect(profile.lastUpdated).toBe(1000);
  });

  it('should update EMA mean toward new values', () => {
    const model = new StationFieldModel('s1', { ...BASE_CONFIG, decayFactor: 0.5 });
    model.update({ subcarriers: [10, 20], timestamp: 1 });
    model.update({ subcarriers: [20, 30], timestamp: 2 });

    const profile = model.getExpectedProfile();
    // EMA: mean += α * (new - mean) → 10 + 0.5*(20-10) = 15
    expect(profile.mean[0]).toBeCloseTo(15, 5);
    expect(profile.mean[1]).toBeCloseTo(25, 5);
  });

  it('should update EMA variance', () => {
    const model = new StationFieldModel('s1', { ...BASE_CONFIG, decayFactor: 0.5 });
    model.update({ subcarriers: [10], timestamp: 1 });
    model.update({ subcarriers: [20], timestamp: 2 });

    const profile = model.getExpectedProfile();
    // After second update: diff=10, var = (1-0.5)*(0 + 0.5*100) = 25
    expect(profile.variance[0]).toBeCloseTo(25, 5);
  });

  it('should report "building" quality when below minSamples', () => {
    const model = new StationFieldModel('s1', { ...BASE_CONFIG, minSamplesForModel: 10 });
    for (let i = 0; i < 5; i++) {
      model.update({ subcarriers: [i], timestamp: i });
    }
    expect(model.getExpectedProfile().quality).toBe('building');
  });

  it('should report "stable" quality when enough samples', () => {
    const model = new StationFieldModel('s1', { ...BASE_CONFIG, minSamplesForModel: 3 });
    for (let i = 0; i < 5; i++) {
      model.update({ subcarriers: [10], timestamp: Date.now() });
    }
    expect(model.getExpectedProfile().quality).toBe('stable');
  });

  it('should report "stale" quality when no recent updates', () => {
    const model = new StationFieldModel('s1', {
      ...BASE_CONFIG,
      minSamplesForModel: 2,
      staleThresholdMs: 50,
    });
    const oldTime = Date.now() - 200;
    model.update({ subcarriers: [10], timestamp: oldTime });
    model.update({ subcarriers: [10], timestamp: oldTime + 1 });

    expect(model.getExpectedProfile().quality).toBe('stale');
  });

  it('should compute deviation with z-scores', () => {
    const model = new StationFieldModel('s1', { ...BASE_CONFIG, decayFactor: 0.5 });
    // Feed stable data to build a model
    for (let i = 0; i < 10; i++) {
      model.update({ subcarriers: [10, 20], timestamp: i });
    }

    // Normal frame — low deviation
    const normal = model.computeDeviation({ subcarriers: [10, 20] });
    expect(normal.anomalyFlag).toBe(false);
    expect(normal.confidence).toBeGreaterThan(0);

    // Extreme frame — high deviation
    const extreme = model.computeDeviation({ subcarriers: [1000, 2000] });
    expect(extreme.deviationScore).toBeGreaterThan(3);
    expect(extreme.anomalyFlag).toBe(true);
  });

  it('should return zero-confidence deviation for empty model', () => {
    const model = new StationFieldModel('s1', BASE_CONFIG);
    const result = model.computeDeviation({ subcarriers: [1, 2, 3] });
    expect(result.confidence).toBe(0);
    expect(result.deviationScore).toBe(0);
    expect(result.anomalyFlag).toBe(false);
  });

  it('should scale confidence by sample count vs minSamples', () => {
    const model = new StationFieldModel('s1', { ...BASE_CONFIG, minSamplesForModel: 10 });
    for (let i = 0; i < 5; i++) {
      model.update({ subcarriers: [10], timestamp: i });
    }
    const result = model.computeDeviation({ subcarriers: [10] });
    expect(result.confidence).toBeCloseTo(0.5, 1);
  });

  it('should serialize and deserialize correctly', () => {
    const model = new StationFieldModel('station-7', BASE_CONFIG);
    model.update({ subcarriers: [1, 2, 3], timestamp: 42 });
    model.update({ subcarriers: [4, 5, 6], timestamp: 43 });

    const json = model.serialize();
    const restored = StationFieldModel.deserialize(json);

    expect(restored.stationId).toBe('station-7');
    expect(restored.getExpectedProfile().sampleCount).toBe(2);
    expect(restored.getExpectedProfile().mean).toHaveLength(3);
    // Verify deviations still work
    const dev = restored.computeDeviation({ subcarriers: [4, 5, 6] });
    expect(dev.confidence).toBeGreaterThan(0);
  });

  it('should round-trip serialize/deserialize and produce identical profiles', () => {
    const model = new StationFieldModel('s-rt', { ...BASE_CONFIG, decayFactor: 0.2 });
    for (let i = 0; i < 20; i++) {
      model.update({ subcarriers: [10 + i * 0.1, 20 - i * 0.1], timestamp: 1000 + i });
    }

    const original = model.getExpectedProfile();
    const restored = StationFieldModel.deserialize(model.serialize());
    const restoredProfile = restored.getExpectedProfile();

    expect(restoredProfile.sampleCount).toBe(original.sampleCount);
    expect(restoredProfile.lastUpdated).toBe(original.lastUpdated);
    original.mean.forEach((v, i) => {
      expect(restoredProfile.mean[i]).toBeCloseTo(v, 8);
    });
  });

  it('should reset all learned state', () => {
    const model = new StationFieldModel('s1', BASE_CONFIG);
    for (let i = 0; i < 10; i++) {
      model.update({ subcarriers: [i * 10], timestamp: i });
    }
    expect(model.getExpectedProfile().sampleCount).toBe(10);

    model.reset();

    const profile = model.getExpectedProfile();
    expect(profile.sampleCount).toBe(0);
    expect(profile.mean).toHaveLength(0);
    expect(profile.variance).toHaveLength(0);
    expect(profile.quality).toBe('insufficient');
  });

  it('should ignore empty subcarrier frames', () => {
    const model = new StationFieldModel('s1', BASE_CONFIG);
    model.update({ subcarriers: [], timestamp: 1 });
    expect(model.getExpectedProfile().sampleCount).toBe(0);
  });

  it('should throttle updates when updateIntervalMs > 0', () => {
    const model = new StationFieldModel('s1', {
      ...BASE_CONFIG,
      updateIntervalMs: 100,
    });
    model.update({ subcarriers: [10], timestamp: 1000 });
    model.update({ subcarriers: [20], timestamp: 1050 }); // too soon, skipped
    model.update({ subcarriers: [30], timestamp: 1150 }); // applied

    const profile = model.getExpectedProfile();
    expect(profile.sampleCount).toBe(2); // only 2 updates applied
  });

  it('should handle subcarrier length mismatch gracefully', () => {
    const model = new StationFieldModel('s1', BASE_CONFIG);
    model.update({ subcarriers: [1, 2, 3, 4], timestamp: 1 });
    // Shorter frame — only updates overlapping subcarriers
    model.update({ subcarriers: [5, 6], timestamp: 2 });

    const profile = model.getExpectedProfile();
    expect(profile.sampleCount).toBe(2);
    expect(profile.mean.length).toBe(4); // original length preserved
  });
});

// ─── FieldModelManager ──────────────────────────────────────────────

describe('FieldModelManager', () => {
  it('should create a new model for unknown station', () => {
    const mgr = new FieldModelManager();
    const model = mgr.getOrCreate('station-a');
    expect(model.stationId).toBe('station-a');
  });

  it('should return the same model for the same station', () => {
    const mgr = new FieldModelManager();
    const m1 = mgr.getOrCreate('station-b');
    const m2 = mgr.getOrCreate('station-b');
    expect(m1).toBe(m2);
  });

  it('should list all tracked stations', () => {
    const mgr = new FieldModelManager();
    mgr.getOrCreate('alpha');
    mgr.getOrCreate('beta');
    mgr.getOrCreate('gamma');

    const stations = mgr.listStations();
    expect(stations).toEqual(expect.arrayContaining(['alpha', 'beta', 'gamma']));
    expect(stations).toHaveLength(3);
  });

  it('should remove a station model', () => {
    const mgr = new FieldModelManager();
    mgr.getOrCreate('x');
    expect(mgr.remove('x')).toBe(true);
    expect(mgr.listStations()).toHaveLength(0);
  });

  it('should return false when removing non-existent station', () => {
    const mgr = new FieldModelManager();
    expect(mgr.remove('nope')).toBe(false);
  });

  it('should apply default config to newly created models', () => {
    const mgr = new FieldModelManager({ minSamplesForModel: 42 });
    const model = mgr.getOrCreate('test-station');
    // Feed enough frames, check that the default config was applied
    for (let i = 0; i < 41; i++) {
      model.update({ subcarriers: [10], timestamp: Date.now() });
    }
    expect(model.getExpectedProfile().quality).toBe('building');

    model.update({ subcarriers: [10], timestamp: Date.now() });
    expect(model.getExpectedProfile().quality).toBe('stable');
  });
});
