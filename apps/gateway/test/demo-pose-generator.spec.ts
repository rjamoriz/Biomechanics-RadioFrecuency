import { DemoPoseGenerator } from '../src/demo/demo-pose-generator';

/**
 * Minimal mock of DemoSimulatorService — only the methods DemoPoseGenerator calls.
 */
const makeSimulatorMock = (overrides: Record<string, unknown> = {}) => ({
  getGaitPhase: jest.fn().mockReturnValue(0),
  getSimulationState: jest.fn().mockReturnValue({
    profile: { name: 'recreational' },
    elapsedSeconds: 60,
    currentGaitFreqHz: 2.5,
    currentCadenceSpm: 150,
    currentBreathingBpm: 20,
    currentHeartRateBpm: 130,
    fatigueLevel: 0,
    signalNoiseLevel: 'clean',
    packetsGenerated: 100,
    treadmillSpeedKmh: 10,
    treadmillInclinePercent: 1,
    isRunning: true,
    ...overrides,
  }),
  getCurrentFatigue: jest.fn().mockReturnValue(0),
  ...overrides,
});

describe('DemoPoseGenerator', () => {
  let generator: DemoPoseGenerator;
  let mockSim: ReturnType<typeof makeSimulatorMock>;

  beforeEach(() => {
    mockSim = makeSimulatorMock();
    generator = new DemoPoseGenerator(mockSim as any);
  });

  it('generates 17 COCO keypoints', () => {
    const frame = generator.generate();
    expect(frame.keypoints2D).toHaveLength(17);
  });

  it('all keypoints have x, y, confidence fields', () => {
    const frame = generator.generate();
    for (const kp of frame.keypoints2D!) {
      expect(kp).toHaveProperty('name');
      expect(typeof kp.x).toBe('number');
      expect(typeof kp.y).toBe('number');
      expect(typeof kp.confidence).toBe('number');
    }
  });

  it('confidence values are between 0 and 1', () => {
    const frame = generator.generate();
    for (const kp of frame.keypoints2D!) {
      expect(kp.confidence).toBeGreaterThanOrEqual(0);
      expect(kp.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('keypoint positions change with different gait phases', () => {
    // Phase = 0
    mockSim.getGaitPhase.mockReturnValue(0);
    const frame0 = generator.generate();
    const ankle0 = frame0.keypoints2D!.find((kp) => kp.name === 'left_ankle')!;

    // Phase = π (opposite phase of gait cycle)
    const mockSimPi = makeSimulatorMock({ getGaitPhase: jest.fn().mockReturnValue(Math.PI) });
    const generatorPi = new DemoPoseGenerator(mockSimPi as any);
    const framePi = generatorPi.generate();
    const anklePi = framePi.keypoints2D!.find((kp) => kp.name === 'left_ankle')!;

    // The ankle x or y should differ between phases
    const positionsDiffer = ankle0.x !== anklePi.x || ankle0.y !== anklePi.y;
    expect(positionsDiffer).toBe(true);
  });

  it('frame is marked experimental', () => {
    const frame = generator.generate();
    expect(frame.experimental).toBe(true);
    expect(frame.validationStatus).toBe('experimental');
  });

  it('modelVersion is present and non-empty', () => {
    const frame = generator.generate();
    expect(typeof frame.modelVersion).toBe('string');
    expect(frame.modelVersion.length).toBeGreaterThan(0);
  });

  it('frame includes disclaimer via experimental + validationStatus', () => {
    const frame = generator.generate();
    // The frame itself carries the experimental flag and validation status —
    // disclaimer text lives in SYNTHETIC_VIEW_DISCLAIMER constant (pose.types.ts)
    expect(frame.experimental).toBe(true);
    expect(frame.validationStatus).toBe('experimental');
  });

  it('frameIndex increments with each call', () => {
    const frame1 = generator.generate();
    const frame2 = generator.generate();
    expect(frame2.frameIndex).toBe(frame1.frameIndex + 1);
  });

  it('confidence level is high / medium / low based on overall confidence', () => {
    const frame = generator.generate();
    expect(['high', 'medium', 'low']).toContain(frame.confidenceLevel);
  });

  it('signalQualityScore is between 0 and 1', () => {
    const frame = generator.generate();
    expect(frame.signalQualityScore).toBeGreaterThanOrEqual(0);
    expect(frame.signalQualityScore).toBeLessThanOrEqual(1);
  });

  it('joints3D is null (demo only generates 2D keypoints)', () => {
    const frame = generator.generate();
    expect(frame.joints3D).toBeNull();
  });
});
