import { VitalSignsService } from '../src/vital-signs/vital-signs.service';
import { HampelFilter } from '../src/signal/hampel-filter';
import { PhaseUnwrapper } from '../src/signal/phase-unwrapper';
import { BandpassFilter } from '../src/signal/bandpass-filter';

describe('VitalSignsService', () => {
  let service: VitalSignsService;

  beforeEach(() => {
    service = new VitalSignsService(
      new HampelFilter(),
      new PhaseUnwrapper(),
      new BandpassFilter(),
    );
    service.setSampleRate(100);
  });

  it('should return null when buffer is empty', () => {
    expect(service.estimateBreathingRate()).toBeNull();
    expect(service.estimateHeartRate()).toBeNull();
  });

  it('should report buffer fill ratio', () => {
    expect(service.getBufferFillRatio()).toBe(0);

    // Push some phase snapshots
    for (let i = 0; i < 100; i++) {
      service.pushPhaseSnapshot([Math.sin(i * 0.1), Math.cos(i * 0.1)]);
    }

    expect(service.getBufferFillRatio()).toBeGreaterThan(0);
    expect(service.getBufferFillRatio()).toBeLessThanOrEqual(1);
  });

  it('should detect a breathing-rate sinusoid in phase', () => {
    // Simulate 0.25 Hz breathing (15 BPM) at 100 Hz sample rate
    const breathingFreq = 0.25; // Hz
    const sampleRate = 100;
    const samples = 1024;

    for (let i = 0; i < samples; i++) {
      const t = i / sampleRate;
      // 4 subcarriers, each with a breathing frequency component
      const phase = Math.sin(2 * Math.PI * breathingFreq * t) * 0.5;
      service.pushPhaseSnapshot([
        phase,
        phase * 0.8,
        phase * 1.2,
        phase * 0.9,
        phase * 1.1,
        phase * 0.7,
        phase * 1.0,
        phase * 0.85,
      ]);
    }

    const breathing = service.estimateBreathingRate();
    expect(breathing).not.toBeNull();
    if (breathing) {
      // Should be close to 15 BPM
      expect(breathing.estimatedBpm).toBeGreaterThan(10);
      expect(breathing.estimatedBpm).toBeLessThan(20);
      expect(breathing.confidence).toBeGreaterThan(0);
      expect(breathing.validationStatus).toBe('experimental');
    }
  });

  it('should return a full vital signs snapshot', () => {
    const snapshot = service.getVitalSigns();
    expect(snapshot.timestamp).toBeDefined();
    expect(snapshot.sampleCount).toBe(0);
    expect(snapshot.bufferFill).toBe(0);
    expect(snapshot.breathing).toBeNull();
    expect(snapshot.heartRate).toBeNull();
  });

  it('should reset state', () => {
    service.pushPhaseSnapshot([1, 2, 3]);
    service.reset();
    expect(service.getBufferFillRatio()).toBe(0);
  });
});
