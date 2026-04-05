import {
  MultiChannelManager,
  ChannelObservation,
  ChannelConfig,
  CHANNEL_TIMEOUT_MS,
  STATS_WINDOW_FRAMES,
  MAX_CHANNELS,
  channelToFrequencyMHz,
  channelToBand,
} from '../../src/signal/multi-channel';

function makeChannelConfig(channel: number): ChannelConfig {
  const freq = channelToFrequencyMHz(channel) ?? 2437;
  return {
    channel,
    frequencyMHz: freq,
    bandwidthMHz: 20,
    band: channelToBand(channel) ?? '2.4GHz',
  };
}

function makeObs(ch: number, overrides: Partial<Omit<ChannelObservation, 'channel'>> = {}): ChannelObservation {
  return {
    channel: makeChannelConfig(ch),
    amplitudes: overrides.amplitudes ?? new Array(64).fill(0).map((_, i) => 0.5 + 0.01 * i),
    phases: overrides.phases ?? new Array(64).fill(0).map((_, i) => (i * Math.PI) / 64),
    rssi: overrides.rssi ?? -45,
    timestamp: overrides.timestamp ?? Date.now(),
    packetIndex: overrides.packetIndex ?? 0,
  };
}

describe('MultiChannelManager', () => {
  let manager: MultiChannelManager;

  beforeEach(() => {
    manager = new MultiChannelManager();
  });

  describe('single channel', () => {
    it('tracks a single channel', () => {
      manager.addObservation(makeObs(6));
      const state = manager.getState();
      expect(state.channels).toHaveLength(1);
      expect(state.channels[0].channel).toBe(6);
    });

    it('returns stats for a single channel', () => {
      manager.addObservation(makeObs(6, { rssi: -45 }));
      const stats = manager.getChannelStats(6);
      expect(stats).not.toBeNull();
      expect(stats!.channel).toBe(6);
      expect(stats!.avgRssi).toBeCloseTo(-45, 0);
    });
  });

  describe('multiple channels', () => {
    it('tracks multiple channels', () => {
      manager.addObservation(makeObs(1));
      manager.addObservation(makeObs(6));
      manager.addObservation(makeObs(11));
      const state = manager.getState();
      expect(state.channels).toHaveLength(3);
      const channelIds = state.channels.map((c) => c.channel);
      expect(channelIds).toContain(1);
      expect(channelIds).toContain(6);
      expect(channelIds).toContain(11);
    });

    it('keeps per-channel stats separate', () => {
      manager.addObservation(makeObs(1, { rssi: -30 }));
      manager.addObservation(makeObs(6, { rssi: -60 }));
      const stats1 = manager.getChannelStats(1);
      const stats6 = manager.getChannelStats(6);
      expect(stats1!.avgRssi).toBeCloseTo(-30, 0);
      expect(stats6!.avgRssi).toBeCloseTo(-60, 0);
    });
  });

  describe('channel timeout', () => {
    it('marks channels inactive when they stop reporting', () => {
      // Channel 1 reported long ago
      const oldTs = Date.now() - CHANNEL_TIMEOUT_MS - 100;
      manager.addObservation(makeObs(1, { timestamp: oldTs }));
      // Channel 6 reported just now
      manager.addObservation(makeObs(6));

      const stats1 = manager.getChannelStats(1);
      const stats6 = manager.getChannelStats(6);
      expect(stats1!.isActive).toBe(false);
      expect(stats6!.isActive).toBe(true);
    });
  });

  describe('best channel selection', () => {
    it('selects channel with best signal quality', () => {
      // Higher RSSI → better quality
      manager.addObservation(makeObs(1, { rssi: -70 }));
      manager.addObservation(makeObs(6, { rssi: -30 }));
      manager.addObservation(makeObs(11, { rssi: -50 }));
      const best = manager.getBestChannel();
      expect(best).toBe(6);
    });

    it('returns null when no channels observed', () => {
      expect(manager.getBestChannel()).toBeNull();
    });

    it('ignores inactive channels for best selection', () => {
      const oldTs = Date.now() - CHANNEL_TIMEOUT_MS - 500;
      manager.addObservation(makeObs(1, { rssi: -20, timestamp: oldTs })); // great RSSI but inactive
      manager.addObservation(makeObs(6, { rssi: -50 }));
      const best = manager.getBestChannel();
      expect(best).toBe(6);
    });
  });

  describe('diversity score', () => {
    it('returns 0 for single channel', () => {
      manager.addObservation(makeObs(6));
      expect(manager.computeDiversityScore()).toBe(0);
    });

    it('returns positive score for multiple active channels', () => {
      manager.addObservation(makeObs(1));
      manager.addObservation(makeObs(6));
      const score = manager.computeDiversityScore();
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('increases with more active channels', () => {
      manager.addObservation(makeObs(1));
      manager.addObservation(makeObs(6));
      const score2 = manager.computeDiversityScore();

      manager.addObservation(makeObs(11));
      const score3 = manager.computeDiversityScore();

      expect(score3).toBeGreaterThan(score2);
    });

    it('computes 1 - 1/N for N active channels', () => {
      manager.addObservation(makeObs(1));
      manager.addObservation(makeObs(6));
      manager.addObservation(makeObs(11));
      expect(manager.computeDiversityScore()).toBeCloseTo(1 - 1 / 3, 2);
    });

    it('returns 0 when no channels', () => {
      expect(manager.computeDiversityScore()).toBe(0);
    });
  });

  describe('frame fusion', () => {
    it('returns null when no channels active', () => {
      expect(manager.fuseLatest()).toBeNull();
    });

    it('returns null for stale observations', () => {
      const oldTs = Date.now() - 500; // 500ms ago > MAX_AGE_MS (100ms)
      manager.addObservation(makeObs(6, { timestamp: oldTs }));
      expect(manager.fuseLatest()).toBeNull();
    });

    it('returns single channel passthrough for one active channel', () => {
      const amps = new Array(64).fill(2.0);
      manager.addObservation(makeObs(6, { amplitudes: amps }));
      const fused = manager.fuseLatest();
      expect(fused).not.toBeNull();
      expect(fused!.contributingChannels).toContain(6);
      expect(fused!.amplitudes).toHaveLength(64);
    });
  });

  describe('channel-frequency mapping', () => {
    it('maps 2.4GHz channels', () => {
      expect(channelToFrequencyMHz(1)).toBe(2412);
      expect(channelToFrequencyMHz(6)).toBe(2437);
      expect(channelToFrequencyMHz(11)).toBe(2462);
      expect(channelToFrequencyMHz(14)).toBe(2484);
    });

    it('maps 5GHz channels', () => {
      expect(channelToFrequencyMHz(36)).toBe(5180);
      expect(channelToFrequencyMHz(149)).toBe(5745);
      expect(channelToFrequencyMHz(165)).toBe(5825);
    });

    it('returns null for unknown channel', () => {
      expect(channelToFrequencyMHz(999)).toBeNull();
    });

    it('identifies band correctly', () => {
      expect(channelToBand(6)).toBe('2.4GHz');
      expect(channelToBand(36)).toBe('5GHz');
      expect(channelToBand(999)).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles rapid observations on same channel', () => {
      const now = Date.now();
      for (let i = 0; i < 50; i++) {
        manager.addObservation(makeObs(6, { timestamp: now + i, packetIndex: i }));
      }
      const stats = manager.getChannelStats(6);
      expect(stats).not.toBeNull();
      expect(stats!.isActive).toBe(true);
    });

    it('returns null stats for unknown channel', () => {
      expect(manager.getChannelStats(99)).toBeNull();
    });

    it('reset clears all state', () => {
      manager.addObservation(makeObs(6));
      manager.reset();
      expect(manager.getState().channels).toHaveLength(0);
      expect(manager.getBestChannel()).toBeNull();
      expect(manager.computeDiversityScore()).toBe(0);
    });

    it('state reports isMultiChannel correctly', () => {
      manager.addObservation(makeObs(6));
      expect(manager.getState().isMultiChannel).toBe(false);
      manager.addObservation(makeObs(11));
      expect(manager.getState().isMultiChannel).toBe(true);
    });
  });
});
