import { BodyVelocityProfile } from '../src/signal/body-velocity-profile';

describe('BodyVelocityProfile', () => {
  let bvp: BodyVelocityProfile;

  beforeEach(() => {
    bvp = new BodyVelocityProfile();
  });

  it('should compute velocity from linearly increasing phase', () => {
    // Constant phase rate → constant velocity
    const phase = Array.from({ length: 100 }, (_, i) => i * 0.01);
    const velocity = bvp.computeVelocity(phase, 100, 2.4e9);
    // All velocity values should be approximately equal
    const mean = velocity.reduce((s, v) => s + v, 0) / velocity.length;
    velocity.forEach((v) => {
      expect(Math.abs(v - mean)).toBeLessThan(1e-6);
    });
  });

  it('should return empty for fewer than 2 samples', () => {
    expect(bvp.computeVelocity([], 100)).toEqual([]);
    expect(bvp.computeVelocity([1], 100)).toEqual([]);
  });

  it('should detect impacts at negative-going zero crossings', () => {
    // Simulated velocity: positive → zero → negative pattern
    const velocity = [0.1, 0.2, 0.15, 0.08, -0.05, -0.1, 0.05, 0.12, 0.08, -0.03];
    const impacts = bvp.detectImpacts(velocity, 0.05);
    expect(impacts.length).toBeGreaterThanOrEqual(1);
    // First impact should be at the first positive-to-negative crossing
    expect(impacts[0]).toBe(4);
  });

  it('should compute peak speed per stride', () => {
    const velocity = [0.1, 0.3, 0.5, 0.2, 0.1, 0.05, 0.2, 0.4, 0.3, 0.1];
    const impacts = [0, 5, 9];
    const peaks = bvp.peakSpeedPerStride(velocity, impacts);
    expect(peaks.length).toBe(2);
    // First stride peak should be 0.5
    expect(peaks[0]).toBe(0.5);
    // Second stride peak should be 0.4
    expect(peaks[1]).toBe(0.4);
  });

  it('should average velocity across subcarriers', () => {
    const phases = [
      Array.from({ length: 50 }, (_, i) => i * 0.02),
      Array.from({ length: 50 }, (_, i) => i * 0.04),
    ];
    const avg = bvp.computeAverageVelocity(phases, 100);
    expect(avg.length).toBe(49); // n-1
    // Should be non-zero
    expect(avg[0]).not.toBe(0);
  });
});
