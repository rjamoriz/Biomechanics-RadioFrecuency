/**
 * Fresnel Zone Geometry Calculator
 *
 * Models the RF sensing ellipsoid between TX and RX antennas for
 * treadmill biomechanics station assessment. Determines whether
 * the treadmill is within the primary sensing volume and computes
 * zone-based signal attenuation estimates.
 *
 * Pure geometry — no state, no side effects.
 *
 * Fresnel zone radius: R_n = sqrt(n * λ * d1 * d2 / (d1 + d2))
 *
 * All outputs are estimated geometric proxies — not exact RF measurements.
 */

// ─── Constants ──────────────────────────────────────────────────────

export const SPEED_OF_LIGHT = 299_792_458; // m/s
export const DEFAULT_FREQ_GHZ = 2.4;
const ZONES_TO_COMPUTE = 3;

// ─── Types ──────────────────────────────────────────────────────────

export interface StationGeometry {
  /** TX antenna position in meters [x, y, z] */
  txPosition: [number, number, number];
  /** RX antenna position in meters [x, y, z] */
  rxPosition: [number, number, number];
  /** Center of treadmill belt in meters [x, y, z] */
  treadmillCenter: [number, number, number];
  /** Treadmill belt length in meters (typical ~2.0) */
  treadmillLength: number;
  /** Treadmill belt width in meters (typical ~0.8) */
  treadmillWidth: number;
  /** Carrier frequency in GHz (default 2.4) */
  frequencyGHz: number;
}

export interface FresnelZoneInfo {
  /** Zone number (1 = primary) */
  n: number;
  /** Zone radius in meters at the treadmill center midpoint */
  radius: number;
  /** Whether the entire treadmill footprint is within this zone */
  containsTreadmill: boolean;
}

export interface FresnelAnalysis {
  /** Primary zone (n=1) radius at treadmill center in meters */
  primaryZoneRadius: number;
  /** Whether the entire treadmill is within the primary Fresnel zone */
  treadmillInZone: boolean;
  /** Zone margin [0, 1]: 1 = centered in zone, 0 = at zone edge */
  zoneMargin: number;
  /** Direct TX → RX distance in meters */
  txRxDistance: number;
  /** Wavelength in meters */
  wavelength: number;
  /** Estimated signal attenuation factor [0, 1]: multiplier for metric confidence */
  signalAttenuationFactor: number;
  /** Fresnel zones 1-3 analysis */
  zones: FresnelZoneInfo[];
}

// ─── Implementation ─────────────────────────────────────────────────

export class FresnelZoneCalculator {
  /**
   * Full Fresnel analysis for a station geometry.
   */
  analyze(geometry: StationGeometry): FresnelAnalysis {
    const wavelength = SPEED_OF_LIGHT / (geometry.frequencyGHz * 1e9);
    const txRxDistance = euclidean3(geometry.txPosition, geometry.rxPosition);

    // Distances from treadmill center to TX and RX
    const d1 = euclidean3(geometry.treadmillCenter, geometry.txPosition);
    const d2 = euclidean3(geometry.treadmillCenter, geometry.rxPosition);

    // Compute zones 1-3
    const zones: FresnelZoneInfo[] = [];
    for (let n = 1; n <= ZONES_TO_COMPUTE; n++) {
      const radius = this.computeZoneRadius(n, d1, d2, wavelength);
      const containsTreadmill = this.treadmillFitsInZone(
        radius,
        geometry,
      );
      zones.push({ n, radius: round4(radius), containsTreadmill });
    }

    const primaryZoneRadius = zones[0].radius;
    const treadmillInZone = zones[0].containsTreadmill;

    // Zone margin: how far the treadmill is from the zone edge
    const maxTreadmillExtent = this.maxTreadmillDistance(geometry);
    const zoneMargin =
      primaryZoneRadius > 0
        ? clamp(1 - maxTreadmillExtent / primaryZoneRadius, 0, 1)
        : 0;

    // Attenuation: exponential decay based on zone margin
    // Full signal at center, drops toward edge
    const signalAttenuationFactor = round4(
      Math.pow(clamp(zoneMargin, 0, 1), 0.5),
    );

    return {
      primaryZoneRadius,
      treadmillInZone,
      zoneMargin: round4(zoneMargin),
      txRxDistance: round4(txRxDistance),
      wavelength: round4(wavelength),
      signalAttenuationFactor,
      zones,
    };
  }

  /**
   * Compute the Fresnel zone radius at a point between TX and RX.
   *
   * R_n = sqrt(n * λ * d1 * d2 / (d1 + d2))
   */
  computeZoneRadius(
    n: number,
    d1: number,
    d2: number,
    wavelength: number,
  ): number {
    const dSum = d1 + d2;
    if (dSum <= 0 || d1 <= 0 || d2 <= 0 || wavelength <= 0 || n <= 0) {
      return 0;
    }
    return Math.sqrt((n * wavelength * d1 * d2) / dSum);
  }

  /**
   * Check if a 3D point falls within the n-th Fresnel zone.
   *
   * A point is in zone n if the path length excess (d1' + d2' - D)
   * is less than n * λ/2.
   */
  isPointInZone(
    point: [number, number, number],
    n: number,
    geometry: StationGeometry,
  ): boolean {
    const wavelength = SPEED_OF_LIGHT / (geometry.frequencyGHz * 1e9);
    const directDistance = euclidean3(geometry.txPosition, geometry.rxPosition);
    const d1 = euclidean3(point, geometry.txPosition);
    const d2 = euclidean3(point, geometry.rxPosition);
    const excess = d1 + d2 - directDistance;

    return excess <= (n * wavelength) / 2;
  }

  // ─── Private ────────────────────────────────────────────────────

  /**
   * Maximum distance from zone axis to any corner of the treadmill footprint.
   * Approximated as max perpendicular distance from treadmill corners
   * to the TX-RX line.
   */
  private maxTreadmillDistance(geometry: StationGeometry): number {
    const corners = this.treadmillCorners(geometry);
    const lineDir = subtract3(geometry.rxPosition, geometry.txPosition);
    const lineLen = magnitude3(lineDir);
    if (lineLen === 0) return 0;

    let maxDist = 0;
    for (const corner of corners) {
      const dist = pointToLineDistance(corner, geometry.txPosition, lineDir, lineLen);
      if (dist > maxDist) maxDist = dist;
    }
    return maxDist;
  }

  /**
   * Check if all treadmill corners fit within a circle of given radius
   * around the TX-RX line (perpendicular distance).
   */
  private treadmillFitsInZone(
    zoneRadius: number,
    geometry: StationGeometry,
  ): boolean {
    const maxDist = this.maxTreadmillDistance(geometry);
    return maxDist <= zoneRadius;
  }

  /**
   * Compute 4 corners of the treadmill footprint in 3D
   * (x-z plane at treadmill center y height).
   */
  private treadmillCorners(
    geometry: StationGeometry,
  ): [number, number, number][] {
    const [cx, cy, cz] = geometry.treadmillCenter;
    const hl = geometry.treadmillLength / 2;
    const hw = geometry.treadmillWidth / 2;
    return [
      [cx - hw, cy, cz - hl],
      [cx + hw, cy, cz - hl],
      [cx - hw, cy, cz + hl],
      [cx + hw, cy, cz + hl],
    ];
  }
}

// ─── Geometry helpers ───────────────────────────────────────────────

function euclidean3(a: [number, number, number], b: [number, number, number]): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function subtract3(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function magnitude3(v: [number, number, number]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function cross3(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Perpendicular distance from point P to a line defined by origin O and direction D.
 */
function pointToLineDistance(
  p: [number, number, number],
  lineOrigin: [number, number, number],
  lineDir: [number, number, number],
  lineLen: number,
): number {
  const op = subtract3(p, lineOrigin);
  const crossProduct = cross3(op, lineDir);
  return magnitude3(crossProduct) / lineLen;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}
