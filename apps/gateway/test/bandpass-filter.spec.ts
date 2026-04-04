import { BandpassFilter } from '../src/signal/bandpass-filter';

describe('BandpassFilter', () => {
  let bp: BandpassFilter;

  beforeEach(() => {
    bp = new BandpassFilter();
  });

  it('should attenuate a DC signal via highpass', () => {
    // 50 Hz sample rate, DC signal of all 1s
    const dc = new Array(200).fill(1.0);
    const result = bp.highpass(dc, 0.5, 50);
    // After highpass, DC should be mostly removed
    const mean = result.slice(20).reduce((s, v) => s + v, 0) / (result.length - 20);
    expect(Math.abs(mean)).toBeLessThan(0.1);
  });

  it('should pass a signal within the band', () => {
    const sampleRate = 100;
    const freq = 1.0; // Hz — within breathing band (0.1–0.5 Hz range won't match, use wide band)
    const n = 500;
    const signal: number[] = [];
    for (let i = 0; i < n; i++) {
      signal.push(Math.sin((2 * Math.PI * freq * i) / sampleRate));
    }

    // Wide bandpass: 0.5–5 Hz (captures 1 Hz)
    const result = bp.apply(signal, 0.5, 5, sampleRate);
    // After transient, should still have energy
    const rmsOut = rms(result.slice(100));
    expect(rmsOut).toBeGreaterThan(0.1);
  });

  it('should attenuate a signal outside the band', () => {
    const sampleRate = 100;
    const freq = 20; // Hz — well above 5 Hz upper cutoff
    const n = 500;
    const signal: number[] = [];
    for (let i = 0; i < n; i++) {
      signal.push(Math.sin((2 * Math.PI * freq * i) / sampleRate));
    }

    // Bandpass: 0.5–5 Hz (20 Hz is far out of band)
    const result = bp.apply(signal, 0.5, 5, sampleRate);
    const rmsOut = rms(result.slice(100));
    expect(rmsOut).toBeLessThan(0.3);
  });

  it('should handle empty signal', () => {
    expect(bp.apply([], 0.5, 5, 100)).toEqual([]);
  });
});

function rms(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sum = arr.reduce((s, v) => s + v * v, 0);
  return Math.sqrt(sum / arr.length);
}
