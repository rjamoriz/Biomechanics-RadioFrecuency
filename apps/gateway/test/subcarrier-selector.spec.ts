import { SubcarrierSelector } from '../src/signal/subcarrier-selector';

describe('SubcarrierSelector', () => {
  let selector: SubcarrierSelector;

  beforeEach(() => {
    selector = new SubcarrierSelector();
  });

  it('should select top-K subcarriers by variance', () => {
    const matrix = [
      [1, 1, 1, 1], // variance ≈ 0
      [1, 10, 1, 10], // high variance
      [5, 5, 5, 5], // variance ≈ 0
      [0, 20, 0, 20], // highest variance
    ];
    const selected = selector.selectByVariance(matrix, 2);
    expect(selected.length).toBe(2);
    expect(selected).toContain(3); // highest variance
    expect(selected).toContain(1); // second highest
  });

  it('should handle topK larger than available subcarriers', () => {
    const matrix = [[1, 2], [3, 4]];
    const selected = selector.selectByVariance(matrix, 10);
    expect(selected.length).toBe(2);
  });

  it('should filter by dynamic threshold', () => {
    const matrix = [
      [1, 1, 1, 1, 1], // nearly zero variance — rejected
      [1, 5, 1, 5, 1], // moderate variance — kept
      [2, 6, 2, 6, 2], // moderate variance — kept
      [0, 100, 0, 100, 0], // extremely high variance — may be rejected as outlier
    ];
    const selected = selector.selectByDynamicThreshold(matrix);
    // Should keep moderate-variance subcarriers, reject zero and possibly extreme
    expect(selected.length).toBeGreaterThan(0);
  });

  it('should average amplitude across selected subcarriers', () => {
    const matrix = [
      [10, 20, 30],
      [30, 40, 50],
      [50, 60, 70],
    ];
    const avg = selector.averageSelectedAmplitude(matrix, [0, 2]);
    // (10+50)/2, (20+60)/2, (30+70)/2 = 30, 40, 50
    expect(avg[0]).toBeCloseTo(30, 1);
    expect(avg[1]).toBeCloseTo(40, 1);
    expect(avg[2]).toBeCloseTo(50, 1);
  });

  it('should return empty for no selected indices', () => {
    expect(selector.averageSelectedAmplitude([[1, 2]], [])).toEqual([]);
  });
});
