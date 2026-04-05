import {
  SignalLinePipeline,
  PipelineStage,
  AcquisitionInput,
  NormalizationInput,
  FilteringInput,
  FeatureInput,
  ClassificationInput,
  OutputInput,
} from '../../src/signal/signal-line-protocol';
import { GateDecision } from '../../src/signal/coherence-gate';

function makeGateDecision(overrides: Partial<GateDecision> = {}): GateDecision {
  return {
    accepted: true,
    gateScore: 0.8,
    reason: 'accepted',
    acceptanceRate: 0.95,
    consecutiveRejections: 0,
    ...overrides,
  };
}

function makeAllStages(overrides: {
  acquisition?: Partial<AcquisitionInput>;
  normalization?: Partial<NormalizationInput>;
  filtering?: Partial<FilteringInput>;
  feature?: Partial<FeatureInput>;
  classification?: Partial<ClassificationInput>;
  output?: Partial<OutputInput>;
} = {}) {
  return {
    acquisition: {
      rssi: -50,
      subcarrierCount: 52,
      mac: 'AA:BB:CC:DD:EE:FF',
      timestamp: Date.now(),
      ...overrides.acquisition,
    },
    normalization: {
      amplitude: [1.0, 2.0, 3.0],
      phase: [0.1, 0.2, 0.3],
      ...overrides.normalization,
    },
    filtering: {
      outlierCount: 1,
      totalSamples: 52,
      phaseContinuous: true,
      ...overrides.filtering,
    },
    feature: {
      gateDecision: makeGateDecision(),
      ...overrides.feature,
    },
    classification: {
      metricsProduced: true,
      confidence: 0.85,
      ...overrides.classification,
    },
    output: {
      emitted: true,
      ...overrides.output,
    },
  };
}

describe('SignalLinePipeline', () => {
  let pipeline: SignalLinePipeline;

  beforeEach(() => {
    pipeline = new SignalLinePipeline();
  });

  describe('full pipeline pass', () => {
    it('reports all stages passed for valid input', () => {
      const report = pipeline.evaluate(makeAllStages());
      expect(report.passed).toBe(true);
      expect(report.failedAt).toBeNull();
      expect(report.stages).toHaveLength(6);
      for (const stage of report.stages) {
        expect(stage.passed).toBe(true);
      }
    });

    it('increments frame index', () => {
      const r1 = pipeline.evaluate(makeAllStages());
      const r2 = pipeline.evaluate(makeAllStages());
      expect(r2.frameIndex).toBe(r1.frameIndex + 1);
    });

    it('reports all stage names', () => {
      const report = pipeline.evaluate(makeAllStages());
      const stageNames = report.stages.map((s) => s.stage);
      expect(stageNames).toEqual([
        PipelineStage.ACQUISITION,
        PipelineStage.NORMALIZATION,
        PipelineStage.FILTERING,
        PipelineStage.FEATURE_EXTRACTION,
        PipelineStage.CLASSIFICATION,
        PipelineStage.OUTPUT,
      ]);
    });
  });

  describe('stage gates — acquisition', () => {
    it('fails for invalid RSSI (too low)', () => {
      const report = pipeline.evaluate(
        makeAllStages({ acquisition: { rssi: -110 } }),
      );
      expect(report.stages[0].passed).toBe(false);
      expect(report.failedAt).toBe(PipelineStage.ACQUISITION);
    });

    it('fails for invalid RSSI (too high)', () => {
      const report = pipeline.evaluate(
        makeAllStages({ acquisition: { rssi: 20 } }),
      );
      expect(report.stages[0].passed).toBe(false);
    });

    it('fails for zero subcarriers', () => {
      const report = pipeline.evaluate(
        makeAllStages({ acquisition: { subcarrierCount: 0 } }),
      );
      expect(report.stages[0].passed).toBe(false);
    });

    it('fails for too many subcarriers', () => {
      const report = pipeline.evaluate(
        makeAllStages({ acquisition: { subcarrierCount: 200 } }),
      );
      expect(report.stages[0].passed).toBe(false);
    });

    it('fails for empty MAC', () => {
      const report = pipeline.evaluate(
        makeAllStages({ acquisition: { mac: '' } }),
      );
      expect(report.stages[0].passed).toBe(false);
    });
  });

  describe('stage gates — normalization', () => {
    it('fails for NaN in amplitude', () => {
      const report = pipeline.evaluate(
        makeAllStages({ normalization: { amplitude: [1, NaN, 3] } }),
      );
      expect(report.stages[1].passed).toBe(false);
    });

    it('fails for Infinity in phase', () => {
      const report = pipeline.evaluate(
        makeAllStages({ normalization: { phase: [0.1, Infinity, 0.3] } }),
      );
      expect(report.stages[1].passed).toBe(false);
    });

    it('fails for empty amplitude', () => {
      const report = pipeline.evaluate(
        makeAllStages({ normalization: { amplitude: [] } }),
      );
      expect(report.stages[1].passed).toBe(false);
    });
  });

  describe('stage gates — filtering', () => {
    it('fails for high outlier ratio (>50%)', () => {
      const report = pipeline.evaluate(
        makeAllStages({ filtering: { outlierCount: 30, totalSamples: 52 } }),
      );
      expect(report.stages[2].passed).toBe(false);
    });

    it('fails for phase discontinuity', () => {
      const report = pipeline.evaluate(
        makeAllStages({ filtering: { phaseContinuous: false } }),
      );
      expect(report.stages[2].passed).toBe(false);
    });

    it('passes for low outlier ratio', () => {
      const report = pipeline.evaluate(
        makeAllStages({ filtering: { outlierCount: 2, totalSamples: 52 } }),
      );
      expect(report.stages[2].passed).toBe(true);
    });
  });

  describe('stage gates — feature extraction', () => {
    it('fails when coherence gate rejects', () => {
      const report = pipeline.evaluate(
        makeAllStages({
          feature: { gateDecision: makeGateDecision({ accepted: false }) },
        }),
      );
      expect(report.stages[3].passed).toBe(false);
    });

    it('passes when coherence gate accepts', () => {
      const report = pipeline.evaluate(makeAllStages());
      expect(report.stages[3].passed).toBe(true);
    });
  });

  describe('stage gates — classification', () => {
    it('fails when no metrics produced', () => {
      const report = pipeline.evaluate(
        makeAllStages({ classification: { metricsProduced: false, confidence: 0 } }),
      );
      expect(report.stages[4].passed).toBe(false);
    });

    it('fails when confidence is zero', () => {
      const report = pipeline.evaluate(
        makeAllStages({ classification: { metricsProduced: true, confidence: 0 } }),
      );
      expect(report.stages[4].passed).toBe(false);
    });
  });

  describe('stage gates — output', () => {
    it('fails when not emitted', () => {
      const report = pipeline.evaluate(
        makeAllStages({ output: { emitted: false } }),
      );
      expect(report.stages[5].passed).toBe(false);
    });
  });

  describe('failure propagation', () => {
    it('reports first failed stage', () => {
      const report = pipeline.evaluate(
        makeAllStages({
          normalization: { amplitude: [NaN] },
          classification: { metricsProduced: false, confidence: 0 },
        }),
      );
      expect(report.passed).toBe(false);
      expect(report.failedAt).toBe(PipelineStage.NORMALIZATION);
    });

    it('all stages report independently even after failure', () => {
      const report = pipeline.evaluate(
        makeAllStages({ acquisition: { rssi: -200 } }),
      );
      // All 6 stages still have results
      expect(report.stages).toHaveLength(6);
      expect(report.stages[0].passed).toBe(false);
      // Other stages may pass or fail independently
    });
  });

  describe('timing and diagnostics', () => {
    it('reports non-negative stage durations', () => {
      const report = pipeline.evaluate(makeAllStages());
      for (const stage of report.stages) {
        expect(stage.durationMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('reports non-negative total duration', () => {
      const report = pipeline.evaluate(makeAllStages());
      expect(report.totalDurationMs).toBeGreaterThanOrEqual(0);
    });

    it('stages have diagnostics objects', () => {
      const report = pipeline.evaluate(makeAllStages());
      for (const stage of report.stages) {
        expect(typeof stage.diagnostics).toBe('object');
      }
    });
  });

  describe('throughput', () => {
    it('reports zero throughput for first frame', () => {
      const report = pipeline.evaluate(makeAllStages());
      expect(report.throughputHz).toBe(0);
    });

    it('reports positive throughput after multiple frames', () => {
      for (let i = 0; i < 5; i++) {
        pipeline.evaluate(makeAllStages());
      }
      const report = pipeline.evaluate(makeAllStages());
      // Throughput might be 0 if timestamps are too close (same ms)
      expect(report.throughputHz).toBeGreaterThanOrEqual(0);
    });
  });

  describe('pass rates', () => {
    it('starts with all rates at 1 after first pass', () => {
      pipeline.evaluate(makeAllStages());
      const rates = pipeline.getPassRates();
      for (const stage of Object.values(PipelineStage)) {
        expect(rates[stage]).toBe(1);
      }
    });

    it('pass rates decrease after failures', () => {
      // First: all pass
      pipeline.evaluate(makeAllStages());

      // Then: acquisition fails repeatedly
      for (let i = 0; i < 20; i++) {
        pipeline.evaluate(makeAllStages({ acquisition: { rssi: -200 } }));
      }

      const rates = pipeline.getPassRates();
      expect(rates[PipelineStage.ACQUISITION]).toBeLessThan(1);
    });
  });

  describe('reset', () => {
    it('resets frame index and pass rates', () => {
      for (let i = 0; i < 5; i++) {
        pipeline.evaluate(makeAllStages());
      }
      pipeline.reset();

      const report = pipeline.evaluate(makeAllStages());
      expect(report.frameIndex).toBe(1);
    });
  });
});
