import { StftProcessor, fft, nextPowerOf2 } from '../../signal/stft-processor';

describe('StftProcessor', () => {
  describe('nextPowerOf2', () => {
    it('should return the same value for powers of 2', () => {
      expect(nextPowerOf2(1)).toBe(1);
      expect(nextPowerOf2(64)).toBe(64);
      expect(nextPowerOf2(256)).toBe(256);
    });

    it('should round up to next power of 2', () => {
      expect(nextPowerOf2(3)).toBe(4);
      expect(nextPowerOf2(100)).toBe(128);
      expect(nextPowerOf2(129)).toBe(256);
    });
  });

  describe('fft', () => {
    it('should produce DC component for constant signal', () => {
      const signal = new Array(8).fill(5);
      const { re, im } = fft(signal);
      // DC = sum of all samples
      expect(re[0]).toBeCloseTo(40, 5);
      expect(im[0]).toBeCloseTo(0, 5);
      // All other bins should be ~0
      for (let i = 1; i < 8; i++) {
        expect(Math.sqrt(re[i] ** 2 + im[i] ** 2)).toBeCloseTo(0, 5);
      }
    });

    it('should detect a single known frequency', () => {
      const n = 256;
      const sampleRate = 100;
      const freq = 10; // 10 Hz
      const signal = new Array(n);
      for (let i = 0; i < n; i++) {
        signal[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
      }
      const { re, im } = fft(signal);
      // Peak should be at bin = freq * n / sampleRate = 25.6 → bin 26
      const expectedBin = Math.round((freq * n) / sampleRate);
      let peakBin = 0;
      let peakMag = 0;
      for (let i = 1; i < n / 2; i++) {
        const mag = Math.sqrt(re[i] ** 2 + im[i] ** 2);
        if (mag > peakMag) {
          peakMag = mag;
          peakBin = i;
        }
      }
      expect(Math.abs(peakBin - expectedBin)).toBeLessThanOrEqual(1);
    });

    it('should handle length-1 input', () => {
      const { re, im } = fft([42]);
      expect(re[0]).toBeCloseTo(42);
      expect(im[0]).toBeCloseTo(0);
    });
  });

  describe('compute', () => {
    it('should return empty spectrogram if signal shorter than window', () => {
      const stft = new StftProcessor({ windowSize: 128, sampleRate: 25 });
      const result = stft.compute([1, 2, 3]);
      expect(result.magnitudes).toHaveLength(0);
      expect(result.timeStamps).toHaveLength(0);
      expect(result.frequencies.length).toBeGreaterThan(0);
    });

    it('should compute correct number of time frames', () => {
      const windowSize = 64;
      const hopSize = 16;
      const signalLen = 256;
      const stft = new StftProcessor({ windowSize, hopSize, sampleRate: 100 });
      const signal = new Array(signalLen).fill(0).map(() => Math.random());
      const result = stft.compute(signal);

      const expectedFrames = Math.floor((signalLen - windowSize) / hopSize) + 1;
      expect(result.magnitudes.length).toBe(expectedFrames);
      expect(result.timeStamps.length).toBe(expectedFrames);
    });

    it('should have correct frequency axis', () => {
      const stft = new StftProcessor({ windowSize: 64, sampleRate: 100 });
      const fftSize = stft.getFftSize();
      const result = stft.compute(new Array(100).fill(0));
      // Nyquist = sampleRate/2 = 50 Hz
      const lastFreq = result.frequencies[result.frequencies.length - 1];
      expect(lastFreq).toBeCloseTo(50, 2);
      expect(result.frequencies[0]).toBe(0);
      expect(result.frequencies.length).toBe(fftSize / 2 + 1);
    });

    it('should detect tone in spectrogram', () => {
      const sampleRate = 100;
      const toneHz = 20;
      const signalLen = 512;
      const signal = new Array(signalLen);
      for (let i = 0; i < signalLen; i++) {
        signal[i] = Math.sin((2 * Math.PI * toneHz * i) / sampleRate);
      }

      const stft = new StftProcessor({
        windowSize: 128,
        hopSize: 32,
        sampleRate,
      });
      const result = stft.compute(signal);

      // Every time frame should have peak near 20 Hz
      for (const frame of result.magnitudes) {
        let peakBin = 0;
        let peakVal = 0;
        for (let i = 1; i < frame.length; i++) {
          if (frame[i] > peakVal) {
            peakVal = frame[i];
            peakBin = i;
          }
        }
        const peakFreq = result.frequencies[peakBin];
        expect(Math.abs(peakFreq - toneHz)).toBeLessThan(3);
      }
    });

    it('should report window and hop sizes in ms', () => {
      const stft = new StftProcessor({
        windowSize: 128,
        hopSize: 32,
        sampleRate: 25,
      });
      const result = stft.compute(new Array(200).fill(0));
      expect(result.windowSizeMs).toBeCloseTo((128 / 25) * 1000, 1);
      expect(result.hopSizeMs).toBeCloseTo((32 / 25) * 1000, 1);
    });
  });

  describe('extractPeakTrack', () => {
    it('should track peak frequency from raw signal', () => {
      const sampleRate = 100;
      const toneHz = 15;
      const signalLen = 512;
      const signal = new Array(signalLen);
      for (let i = 0; i < signalLen; i++) {
        signal[i] = Math.sin((2 * Math.PI * toneHz * i) / sampleRate);
      }

      const stft = new StftProcessor({
        windowSize: 128,
        hopSize: 32,
        sampleRate,
      });
      const track = stft.extractPeakTrack(signal, 10, 25);

      expect(track.length).toBeGreaterThan(0);
      for (const point of track) {
        expect(Math.abs(point.frequency - toneHz)).toBeLessThan(3);
        expect(point.power).toBeGreaterThan(0);
        expect(point.time).toBeGreaterThan(0);
      }
    });

    it('should accept SpectrogramResult directly', () => {
      const stft = new StftProcessor({ windowSize: 64, hopSize: 16, sampleRate: 100 });
      const signal = new Array(200).fill(0).map((_, i) =>
        Math.sin((2 * Math.PI * 30 * i) / 100),
      );
      const spec = stft.compute(signal);
      const track = stft.extractPeakTrack(spec, 20, 40);
      expect(track.length).toBe(spec.magnitudes.length);
    });

    it('should return empty for out-of-range frequency band', () => {
      const stft = new StftProcessor({ windowSize: 64, sampleRate: 100 });
      const signal = new Array(100).fill(1);
      const track = stft.extractPeakTrack(signal, 90, 100);
      // Nyquist is 50 Hz, so 90-100 Hz band is out of range
      expect(track).toHaveLength(0);
    });
  });
});
