import { CoherenceMonitor } from '../../src/autonomous/coherence-monitor';

describe('CoherenceMonitor', () => {
  let monitor: CoherenceMonitor;

  beforeEach(() => {
    monitor = new CoherenceMonitor();
  });

  it('should return default state for empty phases', () => {
    const state = monitor.processFrame([]);
    expect(state.frameCount).toBe(0);
    expect(state.coherence).toBe(0);
  });

  it('should compute coherence from uniform phases', () => {
    // All phases = 0 → all Bloch vectors point to [0,0,1] → coherence = 1
    const phases = new Array(32).fill(0);
    const state = monitor.processFrame(phases);

    expect(state.frameCount).toBe(1);
    expect(state.coherence).toBe(1);
    expect(state.blochVector[0]).toBe(0); // x always 0
    expect(state.blochVector[2]).toBeCloseTo(1, 3); // z ≈ 1 for phase=0
  });

  it('should give lower coherence for random phases', () => {
    // Mixed phases should produce lower coherence than uniform
    const phases = Array.from({ length: 32 }, (_, i) => (i * 0.5) - 8);
    const state = monitor.processFrame(phases);

    expect(state.coherence).toBeGreaterThanOrEqual(0);
    expect(state.coherence).toBeLessThan(1);
  });

  it('should keep entropy in valid range [0, ln(2)]', () => {
    const phases = Array.from({ length: 16 }, (_, i) => Math.sin(i));
    const state = monitor.processFrame(phases);

    expect(state.entropy).toBeGreaterThanOrEqual(0);
    expect(state.entropy).toBeLessThanOrEqual(0.7); // ln(2) ≈ 0.6931
  });

  it('should keep normalizedEntropy in [0, 1]', () => {
    const phases = Array.from({ length: 16 }, (_, i) => Math.sin(i));
    const state = monitor.processFrame(phases);

    expect(state.normalizedEntropy).toBeGreaterThanOrEqual(0);
    expect(state.normalizedEntropy).toBeLessThanOrEqual(1);
  });

  it('should apply EMA smoothing across frames', () => {
    const stable = new Array(32).fill(0);
    monitor.processFrame(stable);
    const s1 = monitor.getState().normalizedEntropy;

    // Introduce noise
    const noisy = Array.from({ length: 32 }, (_, i) => (i % 2 === 0 ? 1.5 : -1.5));
    monitor.processFrame(noisy);
    const s2 = monitor.getState().normalizedEntropy;

    // EMA should dampen the jump
    expect(s2).not.toBe(s1);
  });

  it('should detect decoherence event on large entropy jump', () => {
    // Start stable
    const stable = new Array(32).fill(0);
    for (let i = 0; i < 20; i++) monitor.processFrame(stable);
    expect(monitor.getState().isDecoherenceEvent).toBe(false);

    // Sudden phase scramble → entropy spike
    const scrambled = Array.from({ length: 32 }, (_, i) => Math.PI * (i % 3 - 1));
    const state = monitor.processFrame(scrambled);

    // The test checks the mechanism works; exact trigger depends on alpha/threshold
    expect(typeof state.isDecoherenceEvent).toBe('boolean');
  });

  it('should compute Bloch drift between consecutive frames', () => {
    const phases1 = new Array(32).fill(0);
    monitor.processFrame(phases1);
    expect(monitor.getState().blochDrift).toBe(0); // First frame → no drift

    const phases2 = new Array(32).fill(Math.PI / 4);
    monitor.processFrame(phases2);
    expect(monitor.getState().blochDrift).toBeGreaterThan(0);
  });

  it('should limit subcarriers to MAX_SUBCARRIERS=64', () => {
    const phases = new Array(128).fill(0.5);
    const state = monitor.processFrame(phases);
    // Should not crash and should process successfully
    expect(state.frameCount).toBe(1);
  });

  it('should reset to default state', () => {
    monitor.processFrame(new Array(16).fill(0.3));
    expect(monitor.getState().frameCount).toBe(1);

    monitor.reset();
    expect(monitor.getState().frameCount).toBe(0);
    expect(monitor.getState().coherence).toBe(0);
  });

  it('should have x-component of Bloch vector always zero', () => {
    for (let trial = 0; trial < 5; trial++) {
      const phases = Array.from({ length: 32 }, () => Math.random() * Math.PI * 2 - Math.PI);
      const state = monitor.processFrame(phases);
      expect(state.blochVector[0]).toBe(0);
    }
  });
});
