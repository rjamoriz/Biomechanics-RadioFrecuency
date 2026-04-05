import {
  CrossViewpointFusion,
  StationObservation,
  METRICS_TO_FUSE,
  DEFAULT_OUTLIER_SIGMA,
  MIN_STATIONS_FOR_OUTLIER_DETECTION,
} from '../../src/signal/cross-viewpoint-fusion';

function makeObservation(overrides: Partial<StationObservation> = {}): StationObservation {
  return {
    stationId: 'station-A',
    metrics: {
      estimatedCadence: 170,
      stepIntervalEstimate: 0.35,
      symmetryProxy: 0.95,
      contactTimeProxy: 0.22,
      flightTimeProxy: 0.13,
      fatigueDriftScore: 0.05,
    },
    signalQuality: 0.8,
    fresnelZoneMargin: 0.7,
    gateAcceptanceRate: 0.9,
    timestamp: 1000,
    ...overrides,
  };
}

describe('CrossViewpointFusion', () => {
  let fusion: CrossViewpointFusion;

  beforeEach(() => {
    fusion = new CrossViewpointFusion();
  });

  describe('empty input', () => {
    it('returns zero-valued result for no observations', () => {
      const result = fusion.fuse([]);
      expect(result.stationCount).toBe(0);
      expect(result.estimatedCadence).toBe(0);
      expect(result.consensusConfidence).toBe(0);
    });
  });

  describe('single station passthrough', () => {
    it('passes through single station metrics unchanged', () => {
      const obs = makeObservation();
      const result = fusion.fuseSingle(obs);
      expect(result.estimatedCadence).toBe(170);
      expect(result.symmetryProxy).toBe(0.95);
      expect(result.stationCount).toBe(1);
      expect(result.consensusConfidence).toBe(1);
    });

    it('sets station weight to 1 for single station', () => {
      const obs = makeObservation({ stationId: 'S1' });
      const result = fusion.fuseSingle(obs);
      expect(result.stationWeights['S1']).toBe(1);
    });

    it('returns no outlier stations for single observation', () => {
      const result = fusion.fuseSingle(makeObservation());
      expect(result.outlierStations).toHaveLength(0);
    });
  });

  describe('two-station weighted fusion', () => {
    it('weighted-averages metrics from two stations', () => {
      const obsA = makeObservation({
        stationId: 'A',
        metrics: { ...makeObservation().metrics, estimatedCadence: 170 },
        signalQuality: 0.8,
        fresnelZoneMargin: 1.0,
        gateAcceptanceRate: 1.0,
      });
      const obsB = makeObservation({
        stationId: 'B',
        metrics: { ...makeObservation().metrics, estimatedCadence: 180 },
        signalQuality: 0.4,
        fresnelZoneMargin: 1.0,
        gateAcceptanceRate: 1.0,
      });
      const result = fusion.fuse([obsA, obsB]);
      // A has weight 0.8, B has weight 0.4 → fused = (0.8*170 + 0.4*180) / 1.2
      const expected = (0.8 * 170 + 0.4 * 180) / (0.8 + 0.4);
      expect(result.estimatedCadence).toBeCloseTo(expected, 2);
    });

    it('higher quality station dominates the fusion', () => {
      const obsA = makeObservation({
        stationId: 'A',
        metrics: { ...makeObservation().metrics, estimatedCadence: 170 },
        signalQuality: 0.9,
        fresnelZoneMargin: 0.9,
        gateAcceptanceRate: 0.9,
      });
      const obsB = makeObservation({
        stationId: 'B',
        metrics: { ...makeObservation().metrics, estimatedCadence: 200 },
        signalQuality: 0.1,
        fresnelZoneMargin: 0.1,
        gateAcceptanceRate: 0.1,
      });
      const result = fusion.fuse([obsA, obsB]);
      // Station A should dominate
      expect(result.estimatedCadence).toBeCloseTo(170, 0);
      expect(result.stationWeights['A']).toBeGreaterThan(result.stationWeights['B']);
    });
  });

  describe('three-station outlier rejection', () => {
    it('detects outlier station when one deviates extremely', () => {
      // Outlier station needs LOW quality so it doesn't inflate the weighted mean/std
      const agreeing = ['A', 'B', 'C', 'D'].map((id) =>
        makeObservation({
          stationId: id,
          metrics: { ...makeObservation().metrics, estimatedCadence: 170 },
          signalQuality: 0.9,
          fresnelZoneMargin: 0.9,
          gateAcceptanceRate: 0.9,
        }),
      );
      const outlier = makeObservation({
        stationId: 'E',
        metrics: { ...makeObservation().metrics, estimatedCadence: 800 },
        signalQuality: 0.2,
        fresnelZoneMargin: 0.2,
        gateAcceptanceRate: 0.2,
      });
      const result = fusion.fuse([...agreeing, outlier]);
      expect(result.outlierStations).toContain('E');
    });

    it('does not flag outliers when all stations agree', () => {
      const obs = ['A', 'B', 'C'].map((id) =>
        makeObservation({
          stationId: id,
          metrics: { ...makeObservation().metrics, estimatedCadence: 170 + Math.random() * 2 },
        }),
      );
      const result = fusion.fuse(obs);
      expect(result.outlierStations).toHaveLength(0);
    });

    it('requires minimum stations for outlier detection', () => {
      // Only 2 stations — should not do outlier detection
      const obsA = makeObservation({ stationId: 'A' });
      const obsB = makeObservation({
        stationId: 'B',
        metrics: { ...makeObservation().metrics, estimatedCadence: 500 },
      });
      const result = fusion.fuse([obsA, obsB]);
      expect(result.outlierStations).toHaveLength(0);
    });
  });

  describe('consensus confidence', () => {
    it('returns high confidence when stations agree', () => {
      const obs = ['A', 'B', 'C'].map((id) =>
        makeObservation({ stationId: id }),
      );
      const result = fusion.fuse(obs);
      expect(result.consensusConfidence).toBeGreaterThan(0.8);
    });

    it('returns lower confidence when stations disagree', () => {
      const obsA = makeObservation({
        stationId: 'A',
        metrics: { ...makeObservation().metrics, estimatedCadence: 150 },
      });
      const obsB = makeObservation({
        stationId: 'B',
        metrics: { ...makeObservation().metrics, estimatedCadence: 200 },
      });
      const result = fusion.fuse([obsA, obsB]);
      expect(result.consensusConfidence).toBeLessThan(1);
    });
  });

  describe('station weights', () => {
    it('normalizes weights to sum to 1', () => {
      const obs = ['A', 'B', 'C'].map((id) =>
        makeObservation({ stationId: id }),
      );
      const result = fusion.fuse(obs);
      const weightSum = Object.values(result.stationWeights).reduce((a, b) => a + b, 0);
      expect(weightSum).toBeCloseTo(1, 2);
    });

    it('assigns higher weight to better quality station', () => {
      const obsA = makeObservation({
        stationId: 'A',
        signalQuality: 0.9,
        fresnelZoneMargin: 0.9,
        gateAcceptanceRate: 0.9,
      });
      const obsB = makeObservation({
        stationId: 'B',
        signalQuality: 0.3,
        fresnelZoneMargin: 0.3,
        gateAcceptanceRate: 0.3,
      });
      const result = fusion.fuse([obsA, obsB]);
      expect(result.stationWeights['A']).toBeGreaterThan(result.stationWeights['B']);
    });
  });

  describe('metric agreement', () => {
    it('returns per-metric agreement scores', () => {
      const obs = ['A', 'B'].map((id) => makeObservation({ stationId: id }));
      const result = fusion.fuse(obs);
      for (const metric of METRICS_TO_FUSE) {
        expect(result.metricAgreement[metric]).toBeDefined();
        expect(result.metricAgreement[metric]).toBeGreaterThanOrEqual(0);
        expect(result.metricAgreement[metric]).toBeLessThanOrEqual(1);
      }
    });

    it('returns agreement of 1 when metrics are identical', () => {
      const obs = ['A', 'B', 'C'].map((id) => makeObservation({ stationId: id }));
      const result = fusion.fuse(obs);
      expect(result.metricAgreement['estimatedCadence']).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('handles all-zero quality gracefully', () => {
      const obs = ['A', 'B'].map((id) =>
        makeObservation({
          stationId: id,
          signalQuality: 0,
          fresnelZoneMargin: 0,
          gateAcceptanceRate: 0,
        }),
      );
      const result = fusion.fuse(obs);
      expect(Number.isFinite(result.estimatedCadence)).toBe(true);
      expect(result.stationCount).toBe(2);
    });

    it('handles identical metrics across stations', () => {
      const obs = ['A', 'B', 'C'].map((id) => makeObservation({ stationId: id }));
      const result = fusion.fuse(obs);
      expect(result.estimatedCadence).toBe(170);
    });
  });
});
