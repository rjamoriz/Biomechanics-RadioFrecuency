import {
  formatCadence,
  formatConfidence,
  formatDuration,
  formatSpeed,
  formatIncline,
  formatPercentage,
} from '@/lib/format';

describe('format utilities', () => {
  it('formatCadence(180) → "180 spm"', () => {
    expect(formatCadence(180)).toBe('180 spm');
  });

  it('formatConfidence(0.85) → "85%"', () => {
    expect(formatConfidence(0.85)).toBe('85%');
  });

  it('formatDuration(125) → "2:05"', () => {
    expect(formatDuration(125)).toBe('2:05');
  });

  it('formatSpeed(12.5) → "12.5 km/h"', () => {
    expect(formatSpeed(12.5)).toBe('12.5 km/h');
  });

  it('formatIncline(3.5) → "3.5%"', () => {
    expect(formatIncline(3.5)).toBe('3.5%');
  });

  it('formatPercentage(0.756) → "75.6%"', () => {
    expect(formatPercentage(0.756)).toBe('75.6%');
  });
});
