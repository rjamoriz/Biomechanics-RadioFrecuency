import { StrideLengthEstimator } from '../stride-length-estimator';

describe('StrideLengthEstimator', () => {
  let estimator: StrideLengthEstimator;

  beforeEach(() => {
    estimator = new StrideLengthEstimator();
  });

  describe('initialization', () => {
    it('should create instance', () => {
      expect(estimator).toBeDefined();
    });
  });

  describe('fromBeltSpeed — happy path', () => {
    it('should estimate stride length at typical jogging pace', () => {
      // 10 km/h = 2.78 m/s, cadence ~170 spm
      const result = estimator.fromBeltSpeed(170, 2.78);
      expect(result).not.toBeNull();
      expect(result!.strideLengthM).toBeGreaterThan(1.5);
      expect(result!.strideLengthM).toBeLessThan(2.5);
      expect(result!.method).toBe('belt_speed');
      expect(result!.confidence).toBeGreaterThan(0);
      expect(result!.confidence).toBeLessThanOrEqual(1);
    });

    it('should estimate stride length at fast running pace', () => {
      // 16 km/h = 4.44 m/s, cadence ~180 spm
      const result = estimator.fromBeltSpeed(180, 4.44);
      expect(result).not.toBeNull();
      expect(result!.strideLengthM).toBeGreaterThan(2.0);
      expect(result!.strideLengthM).toBeLessThan(3.5);
      expect(result!.method).toBe('belt_speed');
    });

    it('should tag out-of-bounds results as experimental', () => {
      // Extreme: very low cadence + high speed → unrealistic stride
      const result = estimator.fromBeltSpeed(60, 5.0);
      expect(result).not.toBeNull();
      expect(result!.validationStatus).toBe('experimental');
      expect(result!.confidence).toBeLessThan(0.8);
    });

    it('should include signal quality in confidence', () => {
      const highQ = estimator.fromBeltSpeed(170, 2.78, 1.0);
      const lowQ = estimator.fromBeltSpeed(170, 2.78, 0.2);
      expect(highQ!.confidence).toBeGreaterThan(lowQ!.confidence);
    });
  });

  describe('fromBeltSpeed — edge cases', () => {
    it('should return null for zero cadence', () => {
      expect(estimator.fromBeltSpeed(0, 2.78)).toBeNull();
    });

    it('should return null for zero belt speed', () => {
      expect(estimator.fromBeltSpeed(170, 0)).toBeNull();
    });

    it('should return null for negative cadence', () => {
      expect(estimator.fromBeltSpeed(-10, 2.78)).toBeNull();
    });

    it('should return null for negative belt speed', () => {
      expect(estimator.fromBeltSpeed(170, -1)).toBeNull();
    });
  });

  describe('fromKeypointDisplacement — happy path', () => {
    it('should estimate stride from keypoint positions', () => {
      // Simulate 1.5m displacement over a stride
      const positions = [
        { timestampMs: 0, x: 0, y: 0 },
        { timestampMs: 150, x: 0.5, y: 0 },
        { timestampMs: 300, x: 1.0, y: 0 },
        { timestampMs: 450, x: 1.5, y: 0 },
      ];
      const result = estimator.fromKeypointDisplacement(positions);
      expect(result).not.toBeNull();
      expect(result!.strideLengthM).toBeCloseTo(1.5, 1);
      expect(result!.method).toBe('keypoint_displacement');
      expect(result!.validationStatus).toBe('experimental');
    });

    it('should handle diagonal displacement', () => {
      const positions = [
        { timestampMs: 0, x: 0, y: 0 },
        { timestampMs: 200, x: 1.0, y: 0.5 },
        { timestampMs: 400, x: 2.0, y: 1.0 },
      ];
      const result = estimator.fromKeypointDisplacement(positions);
      expect(result).not.toBeNull();
      expect(result!.strideLengthM).toBeGreaterThan(2.0);
    });
  });

  describe('fromKeypointDisplacement — edge cases', () => {
    it('should return null with fewer than 3 positions', () => {
      expect(estimator.fromKeypointDisplacement([])).toBeNull();
      expect(
        estimator.fromKeypointDisplacement([
          { timestampMs: 0, x: 0, y: 0 },
          { timestampMs: 100, x: 1, y: 0 },
        ]),
      ).toBeNull();
    });
  });

  describe('bounds checking', () => {
    it('should flag stride < 0.5m as experimental', () => {
      // Very short stride from keypoints
      const positions = [
        { timestampMs: 0, x: 0, y: 0 },
        { timestampMs: 100, x: 0.1, y: 0 },
        { timestampMs: 200, x: 0.2, y: 0 },
      ];
      const result = estimator.fromKeypointDisplacement(positions);
      expect(result).not.toBeNull();
      expect(result!.validationStatus).toBe('experimental');
    });

    it('should flag stride > 3.5m from belt speed as experimental', () => {
      // Unrealistically large stride: slow cadence, fast belt
      const result = estimator.fromBeltSpeed(80, 5.0);
      expect(result).not.toBeNull();
      expect(result!.strideLengthM).toBeGreaterThan(3.5);
      expect(result!.validationStatus).toBe('experimental');
    });
  });
});
