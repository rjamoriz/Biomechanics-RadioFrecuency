import { PhaseUnwrapper } from '../src/signal/phase-unwrapper';

describe('PhaseUnwrapper', () => {
  let unwrapper: PhaseUnwrapper;

  beforeEach(() => {
    unwrapper = new PhaseUnwrapper();
  });

  it('should not modify a continuous signal', () => {
    const signal = [0, 0.1, 0.2, 0.3, 0.4];
    const result = unwrapper.unwrap(signal);
    result.forEach((v, i) => {
      expect(v).toBeCloseTo(signal[i], 10);
    });
  });

  it('should unwrap a positive 2π jump', () => {
    // Simulates wrapped phase: 3.0 → -3.0 (a +2π jump if unwrapped)
    const signal = [3.0, -3.0];
    const result = unwrapper.unwrap(signal);
    // The difference should now be continuous (~0.28 rad instead of ~-6.0 rad)
    const diff = result[1] - result[0];
    expect(Math.abs(diff)).toBeLessThan(Math.PI);
  });

  it('should unwrap a negative 2π jump', () => {
    const signal = [-3.0, 3.0];
    const result = unwrapper.unwrap(signal);
    const diff = result[1] - result[0];
    expect(Math.abs(diff)).toBeLessThan(Math.PI);
  });

  it('should handle empty array', () => {
    expect(unwrapper.unwrap([])).toEqual([]);
  });

  it('should handle single element', () => {
    expect(unwrapper.unwrap([1.5])).toEqual([1.5]);
  });

  it('should produce monotonically increasing unwrap for linearly increasing wrapped phase', () => {
    // Generate a linearly increasing phase that wraps around several times
    const n = 100;
    const wrapped: number[] = [];
    for (let i = 0; i < n; i++) {
      let phase = (i * 0.2) % (2 * Math.PI);
      if (phase > Math.PI) phase -= 2 * Math.PI;
      wrapped.push(phase);
    }
    const result = unwrapper.unwrap(wrapped);
    // Should be roughly monotonically increasing
    let increasing = 0;
    for (let i = 1; i < result.length; i++) {
      if (result[i] >= result[i - 1] - 0.01) increasing++;
    }
    expect(increasing / (n - 1)).toBeGreaterThan(0.9);
  });

  describe('detrend', () => {
    it('should remove linear trend', () => {
      const signal = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      const result = unwrapper.detrend(signal);
      const mean = result.reduce((s, v) => s + v, 0) / result.length;
      expect(Math.abs(mean)).toBeLessThan(0.01);
    });

    it('should preserve zero-mean oscillation', () => {
      const signal = [1, -1, 1, -1, 1, -1, 1, -1];
      const result = unwrapper.detrend(signal);
      // The oscillation pattern should remain
      for (let i = 0; i < result.length - 1; i++) {
        expect(Math.sign(result[i])).not.toBe(Math.sign(result[i + 1]));
      }
    });
  });
});
