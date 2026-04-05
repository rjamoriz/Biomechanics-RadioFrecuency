/**
 * Station Health Monitor (Stoer-Wagner min-cut inspired)
 *
 * Monitors health of multiple sensing stations. Detects degraded stations in
 * a multi-station deployment. Supports up to 8 stations.
 *
 * Edge weights between stations = min(quality_i, quality_j). A low min-cut
 * value indicates a fragile network that could be partitioned by one weak node.
 */

import { StationHealthState } from './autonomous.types';

// ─── Constants ──────────────────────────────────────────────────────

const MAX_STATIONS = 8;
const QUALITY_ALPHA = 0.15;
const MINCUT_FRAGILE = 0.3;
const MINCUT_HEALTHY = 0.6;

// ─── Implementation ─────────────────────────────────────────────────

export class StationHealthMonitor {
  private qualities = new Map<string, number>();
  private isHealing = false;

  /**
   * Update the quality reading for a station. Quality is EMA-smoothed.
   */
  updateStation(stationId: string, rawQuality: number): void {
    const clamped = clamp(rawQuality, 0, 1);
    const prev = this.qualities.get(stationId);

    if (prev === undefined) {
      if (this.qualities.size >= MAX_STATIONS) return; // Fixed capacity
      this.qualities.set(stationId, clamped);
    } else {
      this.qualities.set(stationId, prev * (1 - QUALITY_ALPHA) + clamped * QUALITY_ALPHA);
    }
  }

  /**
   * Remove a station from monitoring.
   */
  removeStation(stationId: string): void {
    this.qualities.delete(stationId);
  }

  /**
   * Compute the current health state.
   */
  getState(): StationHealthState {
    const stationIds = Array.from(this.qualities.keys());
    const n = stationIds.length;

    if (n === 0) {
      return {
        activeStations: 0,
        stationQualities: new Map(),
        minCut: 0,
        isHealing: false,
        weakestStation: null,
        coverageScore: 0,
      };
    }

    // Coverage = mean quality
    let sumQ = 0;
    let minQ = 1;
    let weakest: string | null = null;

    for (const [id, q] of this.qualities) {
      sumQ += q;
      if (q < minQ) {
        minQ = q;
        weakest = id;
      }
    }

    const coverageScore = round4(sumQ / n);

    // Compute Stoer-Wagner min-cut on the complete quality graph
    const minCut = n < 2 ? minQ : this.stoerWagnerMinCut(stationIds);

    // State machine: Healthy ↔ Healing based on min-cut thresholds
    if (this.isHealing) {
      this.isHealing = minCut < MINCUT_HEALTHY;
    } else {
      this.isHealing = minCut < MINCUT_FRAGILE;
    }

    return {
      activeStations: n,
      stationQualities: new Map(this.qualities),
      minCut: round4(minCut),
      isHealing: this.isHealing,
      weakestStation: weakest,
      coverageScore,
    };
  }

  reset(): void {
    this.qualities.clear();
    this.isHealing = false;
  }

  // ─── Stoer-Wagner Min-Cut ───────────────────────────────────────

  /**
   * Stoer-Wagner algorithm on a complete graph where edge weight(i,j) =
   * min(quality_i, quality_j). Returns the global min-cut value.
   *
   * Operates on a small graph (≤8 nodes) so O(V^3) is acceptable.
   */
  private stoerWagnerMinCut(ids: string[]): number {
    const n = ids.length;
    if (n < 2) return this.qualities.get(ids[0]) ?? 0;

    // Build adjacency matrix (indices)
    const q = ids.map((id) => this.qualities.get(id) ?? 0);
    const w: number[][] = Array.from({ length: n }, () => new Float64Array(n) as unknown as number[]);

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const weight = Math.min(q[i], q[j]);
        w[i][j] = weight;
        w[j][i] = weight;
      }
    }

    // Stoer-Wagner
    const merged = new Array<boolean>(n).fill(false);
    // Track which nodes are merged into which
    const groups: number[][] = ids.map((_, i) => [i]);
    let globalMinCut = Infinity;

    for (let phase = 0; phase < n - 1; phase++) {
      // MinimumCutPhase: find "last" and "second-to-last" added
      const inA = new Array<boolean>(n).fill(false);
      const key = new Float64Array(n); // Key values (tightness)

      // Start with first non-merged node
      let start = -1;
      for (let i = 0; i < n; i++) {
        if (!merged[i]) { start = i; break; }
      }
      if (start === -1) break;

      inA[start] = true;
      for (let i = 0; i < n; i++) {
        if (!merged[i] && i !== start) {
          key[i] = w[start][i];
        }
      }

      let prev = start;
      let last = start;

      const remaining = n - phase;
      for (let step = 1; step < remaining; step++) {
        // Find most tightly connected vertex not yet in A
        let maxKey = -1;
        let maxIdx = -1;
        for (let i = 0; i < n; i++) {
          if (!merged[i] && !inA[i] && key[i] > maxKey) {
            maxKey = key[i];
            maxIdx = i;
          }
        }
        if (maxIdx === -1) break;

        prev = last;
        last = maxIdx;
        inA[maxIdx] = true;

        // Update keys
        for (let i = 0; i < n; i++) {
          if (!merged[i] && !inA[i]) {
            key[i] += w[maxIdx][i];
          }
        }
      }

      // Cut of the phase = key[last]
      const cutOfPhase = key[last];
      if (cutOfPhase < globalMinCut) {
        globalMinCut = cutOfPhase;
      }

      // Merge last into prev
      merged[last] = true;
      for (let i = 0; i < n; i++) {
        if (!merged[i]) {
          w[prev][i] += w[last][i];
          w[i][prev] = w[prev][i];
        }
      }
      groups[prev].push(...groups[last]);
    }

    return globalMinCut === Infinity ? 0 : globalMinCut;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
