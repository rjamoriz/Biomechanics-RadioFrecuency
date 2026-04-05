import { GroundContactDetector, GroundContactPhase } from '../ground-contact-detector';

describe('GroundContactDetector', () => {
  let detector: GroundContactDetector;

  beforeEach(() => {
    detector = new GroundContactDetector({ maxBufferSize: 600, minSnr: 2.0 });
  });

  describe('initialization', () => {
    it('should create with default options', () => {
      const d = new GroundContactDetector();
      expect(d).toBeDefined();
    });

    it('should return empty array with insufficient data', () => {
      expect(detector.detect()).toEqual([]);
    });
  });

  describe('happy path — realistic running data', () => {
    it('should detect stance/swing phases from simulated running amplitude', () => {
      // Simulate ~3 seconds at 100 Hz with a ~3 Hz stride pattern
      // Stance phase = high amplitude, swing phase = low amplitude
      const sampleRate = 100;
      const strideFreqHz = 3.0;
      const samples = 300;

      for (let i = 0; i < samples; i++) {
        const t = i / sampleRate;
        // Simulate amplitude: base + sin wave (high = stance, low = swing)
        const phase = 2 * Math.PI * strideFreqHz * t;
        const amplitude = 10 + 5 * Math.sin(phase) + Math.random() * 0.5;
        detector.addSample(amplitude, i * 10); // 10ms per sample
      }

      const phases = detector.detect();
      expect(phases.length).toBeGreaterThan(0);

      for (const p of phases) {
        expect(p.stanceDurationMs).toBeGreaterThan(0);
        expect(p.stanceDurationMs).toBeLessThanOrEqual(600);
        expect(p.contactTimeMs).toBe(p.stanceDurationMs);
        expect(p.confidence).toBeGreaterThanOrEqual(0);
        expect(p.confidence).toBeLessThanOrEqual(1);
        expect(p.validationStatus).toBe('unvalidated');
      }
    });

    it('should reject phases with implausible stance duration', () => {
      // Constant amplitude — no transitions at all
      for (let i = 0; i < 200; i++) {
        detector.addSample(50, i * 10);
      }
      const phases = detector.detect();
      // No stance/swing boundary in a perfectly flat signal
      expect(phases.length).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle all-zero amplitudes', () => {
      for (let i = 0; i < 100; i++) {
        detector.addSample(0, i * 10);
      }
      expect(detector.detect()).toEqual([]);
    });

    it('should handle single sample', () => {
      detector.addSample(10, 0);
      expect(detector.detect()).toEqual([]);
    });

    it('should handle exactly 50 samples (minimum threshold)', () => {
      for (let i = 0; i < 50; i++) {
        detector.addSample(i % 10, i * 10);
      }
      // May or may not detect depending on SNR — should not throw
      expect(() => detector.detect()).not.toThrow();
    });
  });

  describe('SNR rejection', () => {
    it('should return empty when SNR is below threshold', () => {
      const lowSnrDetector = new GroundContactDetector({ minSnr: 50 });
      for (let i = 0; i < 200; i++) {
        lowSnrDetector.addSample(5 + Math.random() * 4, i * 10);
      }
      expect(lowSnrDetector.detect()).toEqual([]);
    });
  });

  describe('reset', () => {
    it('should clear buffer on reset', () => {
      for (let i = 0; i < 100; i++) {
        detector.addSample(10 + Math.sin(i * 0.3) * 5, i * 10);
      }
      detector.reset();
      expect(detector.detect()).toEqual([]);
    });
  });

  describe('confidence scoring', () => {
    it('should produce confidence between 0 and 1', () => {
      const sampleRate = 100;
      for (let i = 0; i < 300; i++) {
        const t = i / sampleRate;
        const amplitude = 10 + 5 * Math.sin(2 * Math.PI * 2.8 * t);
        detector.addSample(amplitude, i * 10);
      }
      const phases = detector.detect();
      for (const p of phases) {
        expect(p.confidence).toBeGreaterThanOrEqual(0);
        expect(p.confidence).toBeLessThanOrEqual(1);
      }
    });
  });
});
