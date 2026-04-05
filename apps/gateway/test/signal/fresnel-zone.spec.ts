import {
  FresnelZoneCalculator,
  StationGeometry,
  SPEED_OF_LIGHT,
  DEFAULT_FREQ_GHZ,
} from '../../src/signal/fresnel-zone';

function makeGeometry(overrides: Partial<StationGeometry> = {}): StationGeometry {
  return {
    txPosition: [-2, 0, 0],
    rxPosition: [2, 0, 0],
    treadmillCenter: [0, 0, 0],
    treadmillLength: 2.0,
    treadmillWidth: 0.8,
    frequencyGHz: DEFAULT_FREQ_GHZ,
    ...overrides,
  };
}

describe('FresnelZoneCalculator', () => {
  let calculator: FresnelZoneCalculator;

  beforeEach(() => {
    calculator = new FresnelZoneCalculator();
  });

  describe('computeZoneRadius', () => {
    it('returns correct Fresnel zone 1 radius', () => {
      const wavelength = SPEED_OF_LIGHT / (2.4e9);
      const d1 = 2;
      const d2 = 2;
      // R1 = sqrt(1 * λ * d1 * d2 / (d1 + d2)) = sqrt(λ * 4 / 4) = sqrt(λ)
      const expected = Math.sqrt(wavelength * d1 * d2 / (d1 + d2));
      const result = calculator.computeZoneRadius(1, d1, d2, wavelength);
      expect(result).toBeCloseTo(expected, 6);
    });

    it('zone 2 radius is sqrt(2) times zone 1 radius', () => {
      const wavelength = SPEED_OF_LIGHT / (2.4e9);
      const d1 = 3;
      const d2 = 3;
      const r1 = calculator.computeZoneRadius(1, d1, d2, wavelength);
      const r2 = calculator.computeZoneRadius(2, d1, d2, wavelength);
      expect(r2 / r1).toBeCloseTo(Math.sqrt(2), 4);
    });

    it('returns 0 for zero distance', () => {
      expect(calculator.computeZoneRadius(1, 0, 2, 0.125)).toBe(0);
      expect(calculator.computeZoneRadius(1, 2, 0, 0.125)).toBe(0);
    });

    it('returns 0 for zero wavelength', () => {
      expect(calculator.computeZoneRadius(1, 2, 2, 0)).toBe(0);
    });

    it('returns 0 for zero n', () => {
      expect(calculator.computeZoneRadius(0, 2, 2, 0.125)).toBe(0);
    });
  });

  describe('analyze', () => {
    it('computes wavelength correctly for 2.4 GHz', () => {
      const geo = makeGeometry();
      const result = calculator.analyze(geo);
      expect(result.wavelength).toBeCloseTo(SPEED_OF_LIGHT / 2.4e9, 4);
    });

    it('computes TX-RX distance correctly', () => {
      const geo = makeGeometry({
        txPosition: [0, 0, 0],
        rxPosition: [4, 0, 0],
      });
      const result = calculator.analyze(geo);
      expect(result.txRxDistance).toBeCloseTo(4, 4);
    });

    it('returns 3 Fresnel zones', () => {
      const geo = makeGeometry();
      const result = calculator.analyze(geo);
      expect(result.zones).toHaveLength(3);
      expect(result.zones[0].n).toBe(1);
      expect(result.zones[1].n).toBe(2);
      expect(result.zones[2].n).toBe(3);
    });

    it('zone radii increase with zone number', () => {
      const geo = makeGeometry();
      const result = calculator.analyze(geo);
      expect(result.zones[0].radius).toBeLessThan(result.zones[1].radius);
      expect(result.zones[1].radius).toBeLessThan(result.zones[2].radius);
    });

    it('small treadmill fits in wide zone', () => {
      const geo = makeGeometry({
        txPosition: [-5, 1, 0],
        rxPosition: [5, 1, 0],
        treadmillCenter: [0, 1, 0],
        treadmillLength: 0.1,
        treadmillWidth: 0.1,
      });
      const result = calculator.analyze(geo);
      // With 10m separation and treadmill on the TX-RX line, zone 1 is large enough
      expect(result.treadmillInZone).toBe(true);
    });

    it('zone margin is 0-1 range', () => {
      const geo = makeGeometry();
      const result = calculator.analyze(geo);
      expect(result.zoneMargin).toBeGreaterThanOrEqual(0);
      expect(result.zoneMargin).toBeLessThanOrEqual(1);
    });

    it('attenuation factor is 0-1 range', () => {
      const geo = makeGeometry();
      const result = calculator.analyze(geo);
      expect(result.signalAttenuationFactor).toBeGreaterThanOrEqual(0);
      expect(result.signalAttenuationFactor).toBeLessThanOrEqual(1);
    });

    it('primary zone radius matches zones[0]', () => {
      const geo = makeGeometry();
      const result = calculator.analyze(geo);
      expect(result.primaryZoneRadius).toBe(result.zones[0].radius);
    });

    it('handles different frequencies', () => {
      const geo24 = makeGeometry({ frequencyGHz: 2.4 });
      const geo5 = makeGeometry({ frequencyGHz: 5.0 });
      const result24 = calculator.analyze(geo24);
      const result5 = calculator.analyze(geo5);
      // Higher frequency → shorter wavelength → smaller zone
      expect(result5.primaryZoneRadius).toBeLessThan(result24.primaryZoneRadius);
    });
  });

  describe('isPointInZone', () => {
    it('treadmill center is in zone 1 when between TX and RX', () => {
      const geo = makeGeometry();
      const result = calculator.isPointInZone(geo.treadmillCenter, 1, geo);
      expect(result).toBe(true);
    });

    it('point far from TX-RX line is not in zone 1', () => {
      const geo = makeGeometry();
      const farPoint: [number, number, number] = [0, 50, 0];
      const result = calculator.isPointInZone(farPoint, 1, geo);
      expect(result).toBe(false);
    });

    it('point at TX is in zone 1', () => {
      const geo = makeGeometry();
      const result = calculator.isPointInZone(geo.txPosition, 1, geo);
      expect(result).toBe(true);
    });

    it('higher zone numbers include more points', () => {
      const geo = makeGeometry();
      const offCenter: [number, number, number] = [0, 5, 0];
      const inZ1 = calculator.isPointInZone(offCenter, 1, geo);
      const inZ5 = calculator.isPointInZone(offCenter, 5, geo);
      // If not in zone 1, might be in zone 5
      expect(inZ5 || !inZ1).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('handles coincident TX and RX', () => {
      const geo = makeGeometry({
        txPosition: [0, 0, 0],
        rxPosition: [0, 0, 0],
      });
      const result = calculator.analyze(geo);
      expect(result.txRxDistance).toBe(0);
      expect(result.primaryZoneRadius).toBe(0);
    });

    it('handles very close TX and RX', () => {
      const geo = makeGeometry({
        txPosition: [0, 0, 0],
        rxPosition: [0.01, 0, 0],
        treadmillCenter: [0.005, 0, 0],
      });
      const result = calculator.analyze(geo);
      expect(result.txRxDistance).toBeCloseTo(0.01, 4);
      expect(result.primaryZoneRadius).toBeGreaterThan(0);
    });
  });
});
