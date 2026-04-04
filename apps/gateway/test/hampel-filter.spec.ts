import { HampelFilter } from '../src/signal/hampel-filter';

describe('HampelFilter', () => {
  let filter: HampelFilter;

  beforeEach(() => {
    filter = new HampelFilter();
  });

  it('should not alter a clean signal', () => {
    const signal = [1, 2, 3, 4, 5, 4, 3, 2, 1];
    const result = filter.filter(signal);
    expect(result).toEqual(signal);
  });

  it('should replace a single spike outlier', () => {
    const signal = [1, 1, 1, 100, 1, 1, 1];
    const result = filter.filter(signal, 3, 3);
    // The outlier at index 3 should be replaced with the local median (~1)
    expect(result[3]).toBe(1);
    expect(result[0]).toBe(1);
  });

  it('should handle empty signal', () => {
    expect(filter.filter([])).toEqual([]);
  });

  it('should handle single-element signal', () => {
    expect(filter.filter([42])).toEqual([42]);
  });

  it('should detect outlier indices', () => {
    const signal = [1, 1, 1, 100, 1, 1, 1];
    const outliers = filter.detectOutliers(signal, 3, 3);
    expect(outliers).toContain(3);
    expect(outliers.length).toBeGreaterThanOrEqual(1);
  });

  it('should not flag non-outliers', () => {
    const signal = [10, 11, 10, 11, 10, 11, 10];
    const outliers = filter.detectOutliers(signal, 3, 3);
    expect(outliers.length).toBe(0);
  });

  it('should handle negative outliers', () => {
    const signal = [5, 5, 5, -100, 5, 5, 5];
    const result = filter.filter(signal, 3, 3);
    expect(result[3]).toBe(5);
  });
});
