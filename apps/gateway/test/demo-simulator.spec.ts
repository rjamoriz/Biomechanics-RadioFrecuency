import { DemoSimulatorService } from '../src/demo/demo-simulator.service';
import { ATHLETE_PROFILES } from '../src/demo/demo-simulator.types';

const makeMockTreadmill = (overrides: Record<string, unknown> = {}) => ({
  getCurrent: jest.fn().mockReturnValue({
    speedKph: 10,
    inclinePercent: 1,
    isRunning: true,
    source: 'manual',
    updatedAt: Date.now(),
    ...overrides,
  }),
});

describe('DemoSimulatorService', () => {
  let service: DemoSimulatorService;
  let mockTreadmillService: ReturnType<typeof makeMockTreadmill>;

  beforeEach(() => {
    mockTreadmillService = makeMockTreadmill();
    service = new DemoSimulatorService(mockTreadmillService as any);
  });

  it('generates a valid CsiPacket with all required fields', () => {
    const packet = service.generatePacket();

    expect(packet).toHaveProperty('timestamp');
    expect(packet).toHaveProperty('rssi');
    expect(packet).toHaveProperty('channel');
    expect(packet).toHaveProperty('mac');
    expect(packet).toHaveProperty('csiLength');
    expect(packet).toHaveProperty('csiValues');
    expect(typeof packet.timestamp).toBe('number');
    expect(typeof packet.rssi).toBe('number');
    expect(packet.channel).toBe(6);
    expect(packet.mac).toBe('DE:MO:SI:MU:LA:TR');
    expect(Array.isArray(packet.csiValues)).toBe(true);
  });

  it('packets have correct number of subcarriers (32 I/Q pairs = 64 values)', () => {
    const packet = service.generatePacket();

    expect(packet.csiLength).toBe(64);
    expect(packet.csiValues).toHaveLength(64);
  });

  it('gait frequency increases with treadmill speed', () => {
    // Low speed
    const lowSpeedMock = makeMockTreadmill({ speedKph: 4 });
    const lowService = new DemoSimulatorService(lowSpeedMock as any);
    const lowState = lowService.getSimulationState();

    // High speed
    const highSpeedMock = makeMockTreadmill({ speedKph: 16 });
    const highService = new DemoSimulatorService(highSpeedMock as any);
    const highState = highService.getSimulationState();

    expect(highState.currentGaitFreqHz).toBeGreaterThan(lowState.currentGaitFreqHz);
    expect(highState.currentCadenceSpm).toBeGreaterThan(lowState.currentCadenceSpm);
  });

  it('fatigue level increases over time (above 5 min ramp start)', () => {
    // Fatigue ramps after 300s. We simulate elapsed time by manipulating startTime.
    const now = Date.now();

    // At 200 seconds elapsed → no fatigue
    (service as any).startTime = now - 200_000;
    const earlyFatigue = service.getCurrentFatigue();

    // At 900 seconds elapsed → fatigue should be > 0
    (service as any).startTime = now - 900_000;
    const lateFatigue = service.getCurrentFatigue();

    expect(earlyFatigue).toBe(0);
    expect(lateFatigue).toBeGreaterThan(0);
    expect(lateFatigue).toBeLessThanOrEqual(1);
  });

  it('breathing rate increases with speed', () => {
    const slowMock = makeMockTreadmill({ speedKph: 4 });
    const slowService = new DemoSimulatorService(slowMock as any);
    const slowState = slowService.getSimulationState();

    const fastMock = makeMockTreadmill({ speedKph: 14 });
    const fastService = new DemoSimulatorService(fastMock as any);
    const fastState = fastService.getSimulationState();

    expect(fastState.currentBreathingBpm).toBeGreaterThan(slowState.currentBreathingBpm);
  });

  it('heart rate increases with speed', () => {
    const slowMock = makeMockTreadmill({ speedKph: 4 });
    const slowService = new DemoSimulatorService(slowMock as any);
    const slowState = slowService.getSimulationState();

    const fastMock = makeMockTreadmill({ speedKph: 14 });
    const fastService = new DemoSimulatorService(fastMock as any);
    const fastState = fastService.getSimulationState();

    expect(fastState.currentHeartRateBpm).toBeGreaterThan(slowState.currentHeartRateBpm);
  });

  it('reset clears elapsed time and fatigue', () => {
    // Simulate 10 minutes elapsed
    (service as any).startTime = Date.now() - 600_000;
    service.generatePacket(); // bump packetsGenerated

    expect(service.getCurrentFatigue()).toBeGreaterThan(0);
    expect(service.getSimulationState().packetsGenerated).toBeGreaterThan(0);

    service.reset();

    expect(service.getCurrentFatigue()).toBe(0);
    expect(service.getSimulationState().packetsGenerated).toBe(0);
    expect(service.getGaitPhase()).toBe(0);
  });

  it('profile change updates biomechanical parameters', () => {
    const defaultState = service.getSimulationState();
    expect(defaultState.profile.name).toBe('recreational');

    service.setProfile(ATHLETE_PROFILES['elite-runner']);
    const eliteState = service.getSimulationState();

    expect(eliteState.profile.name).toBe('elite-runner');
    expect(eliteState.profile.restingHeartRateBpm).toBe(55);
    expect(eliteState.profile.fatigueResistance).toBe(0.85);
    // Elite runner has lower resting heart rate than recreational
    expect(eliteState.currentHeartRateBpm).toBeLessThan(defaultState.currentHeartRateBpm);
  });

  it('signal noise levels affect packet RSSI noise range', () => {
    // Generate many packets under each noise level and check RSSI variance
    const collectRssi = (level: 'clean' | 'moderate' | 'noisy', count: number) => {
      const mock = makeMockTreadmill();
      const svc = new DemoSimulatorService(mock as any);
      svc.setSignalNoise(level);
      const values: number[] = [];
      for (let i = 0; i < count; i++) values.push(svc.generatePacket().rssi);
      return values;
    };

    const cleanRssi = collectRssi('clean', 200);
    const noisyRssi = collectRssi('noisy', 200);

    const variance = (arr: number[]) => {
      const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
      return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
    };

    // Noisy signal should have larger RSSI variance than clean
    expect(variance(noisyRssi)).toBeGreaterThan(variance(cleanRssi));
  });

  it('simulation state reflects treadmill values', () => {
    const state = service.getSimulationState();

    expect(state.treadmillSpeedKmh).toBe(10);
    expect(state.treadmillInclinePercent).toBe(1);
    expect(state.isRunning).toBe(true);
    expect(state.signalNoiseLevel).toBe('clean');
  });

  it('gait frequency is 0 when speed is 0', () => {
    const stoppedMock = makeMockTreadmill({ speedKph: 0 });
    const svc = new DemoSimulatorService(stoppedMock as any);
    const state = svc.getSimulationState();

    expect(state.currentGaitFreqHz).toBe(0);
    expect(state.currentCadenceSpm).toBe(0);
  });
});
