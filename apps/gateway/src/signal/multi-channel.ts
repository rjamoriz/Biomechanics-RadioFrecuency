/**
 * Multi-Channel Manager — WiFi Channel Diversity Tracking & Fusion
 *
 * Tracks CSI observations from multiple WiFi channels, computes per-channel
 * statistics, selects the best channel, and fuses frames across channels
 * for improved robustness against multipath.
 *
 * All outputs are estimated proxy metrics — not clinical-grade measurements.
 */

// ─── Constants ──────────────────────────────────────────────────────

export const CHANNEL_TIMEOUT_MS = 2_000;
export const STATS_WINDOW_FRAMES = 100;
export const MAX_CHANNELS = 8;

// ─── Channel Frequency Maps ────────────────────────────────────────

/**
 * 2.4 GHz channel → center frequency mapping (MHz).
 * Channels 1-13, 5 MHz spacing starting at 2412 MHz.
 */
const CHANNEL_FREQ_2_4: Record<number, number> = {};
for (let ch = 1; ch <= 13; ch++) {
  CHANNEL_FREQ_2_4[ch] = 2412 + (ch - 1) * 5;
}
// Channel 14 (Japan only)
CHANNEL_FREQ_2_4[14] = 2484;

/**
 * 5 GHz UNII band channel → center frequency mapping (MHz).
 * Common channels: 36-165 in 20 MHz spacing.
 */
const CHANNEL_FREQ_5: Record<number, number> = {
  36: 5180, 40: 5200, 44: 5220, 48: 5240,
  52: 5260, 56: 5280, 60: 5300, 64: 5320,
  100: 5500, 104: 5520, 108: 5540, 112: 5560,
  116: 5580, 120: 5600, 124: 5620, 128: 5640,
  132: 5660, 136: 5680, 140: 5700, 144: 5720,
  149: 5745, 153: 5765, 157: 5785, 161: 5805, 165: 5825,
};

export function channelToFrequencyMHz(channel: number): number | null {
  return CHANNEL_FREQ_2_4[channel] ?? CHANNEL_FREQ_5[channel] ?? null;
}

export function channelToBand(channel: number): '2.4GHz' | '5GHz' | null {
  if (CHANNEL_FREQ_2_4[channel] !== undefined) return '2.4GHz';
  if (CHANNEL_FREQ_5[channel] !== undefined) return '5GHz';
  return null;
}

// ─── Types ──────────────────────────────────────────────────────────

export interface ChannelConfig {
  channel: number;
  frequencyMHz: number;
  bandwidthMHz: number;
  band: '2.4GHz' | '5GHz';
}

export interface ChannelObservation {
  channel: ChannelConfig;
  amplitudes: number[];
  phases: number[];
  rssi: number;
  timestamp: number;
  packetIndex: number;
}

export interface ChannelStats {
  channel: number;
  packetRate: number;
  avgRssi: number;
  avgAmplitudeVariance: number;
  signalQuality: number;
  lastSeen: number;
  isActive: boolean;
}

export interface MultiChannelState {
  channels: ChannelStats[];
  bestChannel: number | null;
  diversityScore: number;
  isMultiChannel: boolean;
  totalPacketRate: number;
  recommendedChannel: number | null;
}

export interface MultiChannelFusedFrame {
  amplitudes: number[];
  phases: number[];
  rssi: number;
  diversityGain: number;
  contributingChannels: number[];
  timestamp: number;
}

// ─── Helpers ────────────────────────────────────────────────────────

function round4(v: number): number {
  return Math.round(v * 10_000) / 10_000;
}

// ─── Per-Channel Tracker ────────────────────────────────────────────

class ChannelTracker {
  readonly channel: number;

  // Circular buffer for stats
  private readonly timestamps: number[] = [];
  private readonly rssiHistory: number[] = [];
  private readonly ampVarianceHistory: number[] = [];
  private bufferIndex = 0;
  private bufferCount = 0;

  // Latest observation
  latestAmplitudes: number[] = [];
  latestPhases: number[] = [];
  latestRssi = 0;
  latestTimestamp = 0;

  constructor(channel: number) {
    this.channel = channel;
    this.timestamps = new Array(STATS_WINDOW_FRAMES).fill(0);
    this.rssiHistory = new Array(STATS_WINDOW_FRAMES).fill(0);
    this.ampVarianceHistory = new Array(STATS_WINDOW_FRAMES).fill(0);
  }

  addObservation(obs: ChannelObservation): void {
    this.latestAmplitudes = obs.amplitudes;
    this.latestPhases = obs.phases;
    this.latestRssi = obs.rssi;
    this.latestTimestamp = obs.timestamp;

    this.timestamps[this.bufferIndex] = obs.timestamp;
    this.rssiHistory[this.bufferIndex] = obs.rssi;
    this.ampVarianceHistory[this.bufferIndex] = this.computeAmplitudeVariance(obs.amplitudes);

    this.bufferIndex = (this.bufferIndex + 1) % STATS_WINDOW_FRAMES;
    if (this.bufferCount < STATS_WINDOW_FRAMES) this.bufferCount++;
  }

  getStats(now: number): ChannelStats {
    const isActive = now - this.latestTimestamp < CHANNEL_TIMEOUT_MS;
    const count = this.bufferCount;

    if (count === 0) {
      return {
        channel: this.channel,
        packetRate: 0,
        avgRssi: 0,
        avgAmplitudeVariance: 0,
        signalQuality: 0,
        lastSeen: 0,
        isActive: false,
      };
    }

    // Packet rate: count packets in last 1s window
    let recentCount = 0;
    const oneSecAgo = now - 1000;
    for (let i = 0; i < count; i++) {
      const idx = (this.bufferIndex - 1 - i + STATS_WINDOW_FRAMES) % STATS_WINDOW_FRAMES;
      if (this.timestamps[idx] >= oneSecAgo) recentCount++;
      else break;
    }

    // Average RSSI and amplitude variance
    let rssiSum = 0;
    let varSum = 0;
    for (let i = 0; i < count; i++) {
      const idx = (this.bufferIndex - 1 - i + STATS_WINDOW_FRAMES) % STATS_WINDOW_FRAMES;
      rssiSum += this.rssiHistory[idx];
      varSum += this.ampVarianceHistory[idx];
    }

    const avgRssi = rssiSum / count;
    const avgAmpVar = varSum / count;

    // Signal quality: heuristic combining RSSI range and variance stability
    // RSSI: map [-100, -30] → [0, 1]
    const rssiNorm = Math.max(0, Math.min(1, (avgRssi + 100) / 70));
    // Low variance → stable → good quality
    const varNorm = Math.max(0, 1 - avgAmpVar / 10);
    const signalQuality = round4(0.6 * rssiNorm + 0.4 * varNorm);

    return {
      channel: this.channel,
      packetRate: recentCount,
      avgRssi: round4(avgRssi),
      avgAmplitudeVariance: round4(avgAmpVar),
      signalQuality: Math.max(0, Math.min(1, signalQuality)),
      lastSeen: this.latestTimestamp,
      isActive,
    };
  }

  private computeAmplitudeVariance(amplitudes: number[]): number {
    if (amplitudes.length === 0) return 0;
    let sum = 0;
    let sumSq = 0;
    for (const a of amplitudes) {
      sum += a;
      sumSq += a * a;
    }
    const mean = sum / amplitudes.length;
    return sumSq / amplitudes.length - mean * mean;
  }
}

// ─── Implementation ─────────────────────────────────────────────────

export class MultiChannelManager {
  private readonly trackers = new Map<number, ChannelTracker>();

  constructor() {}

  /** Register a new packet from a specific channel */
  addObservation(obs: ChannelObservation): void {
    const ch = obs.channel.channel;

    if (!this.trackers.has(ch) && this.trackers.size >= MAX_CHANNELS) {
      // Evict the oldest inactive channel
      let oldestCh: number | null = null;
      let oldestTime = Infinity;
      for (const [chNum, tracker] of this.trackers) {
        if (tracker.latestTimestamp < oldestTime) {
          oldestTime = tracker.latestTimestamp;
          oldestCh = chNum;
        }
      }
      if (oldestCh !== null) this.trackers.delete(oldestCh);
    }

    if (!this.trackers.has(ch)) {
      this.trackers.set(ch, new ChannelTracker(ch));
    }

    this.trackers.get(ch)!.addObservation(obs);
  }

  /** Get current multi-channel state */
  getState(): MultiChannelState {
    const now = Date.now();
    const channels: ChannelStats[] = [];
    let totalPacketRate = 0;
    let activeCount = 0;
    let bestQuality = -1;
    let bestChannel: number | null = null;

    for (const tracker of this.trackers.values()) {
      const stats = tracker.getStats(now);
      channels.push(stats);
      totalPacketRate += stats.packetRate;
      if (stats.isActive) {
        activeCount++;
        if (stats.signalQuality > bestQuality) {
          bestQuality = stats.signalQuality;
          bestChannel = stats.channel;
        }
      }
    }

    const diversityScore = activeCount <= 1 ? 0 : round4(1 - 1 / activeCount);

    return {
      channels,
      bestChannel,
      diversityScore,
      isMultiChannel: activeCount > 1,
      totalPacketRate,
      recommendedChannel: bestChannel,
    };
  }

  /** Fuse latest observations across channels into one frame */
  fuseLatest(): MultiChannelFusedFrame | null {
    const now = Date.now();
    const MAX_AGE_MS = 100;

    // Collect recent observations from active channels
    const active: { tracker: ChannelTracker; quality: number }[] = [];

    for (const tracker of this.trackers.values()) {
      const age = now - tracker.latestTimestamp;
      if (age <= MAX_AGE_MS && tracker.latestAmplitudes.length > 0) {
        const stats = tracker.getStats(now);
        if (stats.isActive) {
          active.push({ tracker, quality: stats.signalQuality });
        }
      }
    }

    if (active.length === 0) return null;

    if (active.length === 1) {
      const t = active[0].tracker;
      return {
        amplitudes: [...t.latestAmplitudes],
        phases: [...t.latestPhases],
        rssi: t.latestRssi,
        diversityGain: 1,
        contributingChannels: [t.channel],
        timestamp: t.latestTimestamp,
      };
    }

    // Determine max subcarrier count
    const maxSubs = Math.max(...active.map((a) => a.tracker.latestAmplitudes.length));

    // Quality-weighted fusion per subcarrier
    const fusedAmp = new Array(maxSubs).fill(0);
    const fusedPhase = new Array(maxSubs).fill(0);
    const weightSums = new Array(maxSubs).fill(0);
    let rssiSum = 0;
    let qualSum = 0;
    const contributingChannels: number[] = [];
    let latestTs = 0;

    for (const { tracker, quality } of active) {
      const amps = tracker.latestAmplitudes;
      const phases = tracker.latestPhases;
      contributingChannels.push(tracker.channel);
      rssiSum += quality * tracker.latestRssi;
      qualSum += quality;
      if (tracker.latestTimestamp > latestTs) latestTs = tracker.latestTimestamp;

      for (let k = 0; k < amps.length && k < maxSubs; k++) {
        fusedAmp[k] += quality * amps[k];
        fusedPhase[k] += quality * (phases[k] ?? 0);
        weightSums[k] += quality;
      }
    }

    // Normalize
    for (let k = 0; k < maxSubs; k++) {
      if (weightSums[k] > 0) {
        fusedAmp[k] = round4(fusedAmp[k] / weightSums[k]);
        fusedPhase[k] = round4(fusedPhase[k] / weightSums[k]);
      }
    }

    return {
      amplitudes: fusedAmp,
      phases: fusedPhase,
      rssi: qualSum > 0 ? round4(rssiSum / qualSum) : 0,
      diversityGain: round4(active.length),
      contributingChannels,
      timestamp: latestTs,
    };
  }

  /** Get stats for a specific channel */
  getChannelStats(channel: number): ChannelStats | null {
    const tracker = this.trackers.get(channel);
    if (!tracker) return null;
    return tracker.getStats(Date.now());
  }

  /** Get the best channel recommendation */
  getBestChannel(): number | null {
    return this.getState().bestChannel;
  }

  /** Compute diversity score (0 = single channel, 1 = high diversity) */
  computeDiversityScore(): number {
    return this.getState().diversityScore;
  }

  reset(): void {
    this.trackers.clear();
  }
}
