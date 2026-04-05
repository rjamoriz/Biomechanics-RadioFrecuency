import { StationHealthMonitor } from '../../src/autonomous/station-health-monitor';

describe('StationHealthMonitor', () => {
  let monitor: StationHealthMonitor;

  beforeEach(() => {
    monitor = new StationHealthMonitor();
  });

  it('should return empty state with no stations', () => {
    const state = monitor.getState();
    expect(state.activeStations).toBe(0);
    expect(state.coverageScore).toBe(0);
    expect(state.minCut).toBe(0);
    expect(state.isHealing).toBe(false);
    expect(state.weakestStation).toBeNull();
  });

  it('should register a station', () => {
    monitor.updateStation('s1', 0.9);
    const state = monitor.getState();

    expect(state.activeStations).toBe(1);
    expect(state.stationQualities.get('s1')).toBeCloseTo(0.9, 2);
  });

  it('should apply EMA smoothing on updates', () => {
    monitor.updateStation('s1', 1.0);
    monitor.updateStation('s1', 0.0);

    const quality = monitor.getState().stationQualities.get('s1')!;
    // EMA: 1.0 * 0.85 + 0.0 * 0.15 = 0.85
    expect(quality).toBeCloseTo(0.85, 2);
  });

  it('should identify weakest station', () => {
    monitor.updateStation('s1', 0.9);
    monitor.updateStation('s2', 0.3);
    monitor.updateStation('s3', 0.7);

    const state = monitor.getState();
    expect(state.weakestStation).toBe('s2');
  });

  it('should compute coverage as mean quality', () => {
    monitor.updateStation('s1', 0.8);
    monitor.updateStation('s2', 0.6);

    const state = monitor.getState();
    expect(state.coverageScore).toBeCloseTo(0.7, 2);
  });

  it('should compute min-cut for 2+ stations', () => {
    monitor.updateStation('s1', 0.9);
    monitor.updateStation('s2', 0.9);

    const state = monitor.getState();
    // min-cut with 2 equally-good stations should be > 0
    expect(state.minCut).toBeGreaterThan(0);
  });

  it('should enter healing state when min-cut drops below fragile threshold', () => {
    // Add 2 stations: one good, one very bad
    monitor.updateStation('s1', 0.9);
    monitor.updateStation('s2', 0.1);

    const state = monitor.getState();
    // Min-cut should be low due to weak station
    // The min-cut of a complete graph with edge=min(qi,qj) → min edge is min(0.9,0.1)=0.1
    expect(state.minCut).toBeLessThanOrEqual(0.3);
    expect(state.isHealing).toBe(true);
  });

  it('should exit healing when min-cut rises above healthy threshold', () => {
    // Start in healing
    monitor.updateStation('s1', 0.9);
    monitor.updateStation('s2', 0.1);
    monitor.getState(); // triggers healing

    // Improve the weak station significantly
    for (let i = 0; i < 50; i++) {
      monitor.updateStation('s2', 0.95);
    }

    const state = monitor.getState();
    expect(state.isHealing).toBe(false);
  });

  it('should enforce MAX_STATIONS=8 limit', () => {
    for (let i = 0; i < 10; i++) {
      monitor.updateStation(`s${i}`, 0.8);
    }

    const state = monitor.getState();
    expect(state.activeStations).toBeLessThanOrEqual(8);
  });

  it('should remove a station', () => {
    monitor.updateStation('s1', 0.9);
    monitor.updateStation('s2', 0.8);
    expect(monitor.getState().activeStations).toBe(2);

    monitor.removeStation('s1');
    expect(monitor.getState().activeStations).toBe(1);
  });

  it('should clamp quality to [0, 1]', () => {
    monitor.updateStation('s1', 1.5);
    expect(monitor.getState().stationQualities.get('s1')).toBeLessThanOrEqual(1);

    monitor.updateStation('s2', -0.3);
    expect(monitor.getState().stationQualities.get('s2')).toBeGreaterThanOrEqual(0);
  });

  it('should reset all state', () => {
    monitor.updateStation('s1', 0.9);
    monitor.updateStation('s2', 0.1);
    monitor.getState(); // may enter healing

    monitor.reset();
    const state = monitor.getState();
    expect(state.activeStations).toBe(0);
    expect(state.isHealing).toBe(false);
  });

  it('should compute min-cut on a 3-station complete graph', () => {
    monitor.updateStation('a', 0.8);
    monitor.updateStation('b', 0.5);
    monitor.updateStation('c', 0.9);

    const state = monitor.getState();
    // Should find a valid min-cut
    expect(state.minCut).toBeGreaterThanOrEqual(0);
    expect(state.minCut).toBeLessThanOrEqual(2); // Can't exceed sum of edges
  });
});
