'use client';

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';

/* ──────────────────────────────────────────────
 * Station Geometry — Fresnel Zone Visualization
 *
 * Three.js component showing the RF sensing volume
 * (Fresnel zone ellipsoid) around the treadmill.
 * Displays TX/RX antenna positions, primary zone,
 * and real-time signal quality spatially.
 *
 * This is a SYNTHETIC geometric representation
 * of the estimated RF coverage — not an exact
 * electromagnetic field measurement.
 * ────────────────────────────────────────────── */

// ─── Props ──────────────────────────────────────────────────────────

interface StationGeometryProps {
  /** TX antenna position [x, y, z] in meters */
  txPosition: [number, number, number];
  /** RX antenna position [x, y, z] in meters */
  rxPosition: [number, number, number];
  /** Treadmill center [x, y, z] in meters */
  treadmillCenter: [number, number, number];
  /** Treadmill belt length in meters */
  treadmillLength: number;
  /** Treadmill belt width in meters */
  treadmillWidth: number;
  /** Primary Fresnel zone radius at treadmill center (meters) */
  primaryZoneRadius: number;
  /** Zone margin [0, 1]: 1 = center, 0 = edge */
  zoneMargin: number;
  /** Signal quality [0, 1] */
  signalQuality: number;
  /** Whether an athlete is detected on the treadmill */
  presenceDetected: boolean;
}

// ─── Color helpers ──────────────────────────────────────────────────

function qualityColor(quality: number): string {
  if (quality >= 0.7) return '#22c55e'; // green-500
  if (quality >= 0.4) return '#eab308'; // yellow-500
  return '#ef4444'; // red-500
}

function qualityLabel(quality: number): string {
  if (quality >= 0.7) return 'Good';
  if (quality >= 0.4) return 'Moderate';
  return 'Poor';
}

// ─── TX/RX Antenna ──────────────────────────────────────────────────

function Antenna({
  position,
  color,
  label,
}: {
  position: [number, number, number];
  color: string;
  label: string;
}) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <Html distanceFactor={4} center style={{ pointerEvents: 'none' }}>
        <div className="rounded bg-slate-900/80 px-2 py-0.5 text-xs font-semibold text-white whitespace-nowrap">
          {label}
        </div>
      </Html>
    </group>
  );
}

// ─── Treadmill platform ─────────────────────────────────────────────

function Treadmill({
  center,
  length,
  width,
  presenceDetected,
}: {
  center: [number, number, number];
  length: number;
  width: number;
  presenceDetected: boolean;
}) {
  const beltColor = presenceDetected ? '#3b82f6' : '#64748b'; // blue vs slate
  return (
    <group position={center}>
      {/* Belt surface */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[width, length]} />
        <meshStandardMaterial
          color={beltColor}
          side={THREE.DoubleSide}
          transparent
          opacity={0.6}
        />
      </mesh>
      {/* Frame outline */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <ringGeometry args={[0, 0, 0]} />
      </mesh>
      <lineSegments position={[0, -0.02, 0]}>
        <edgesGeometry
          args={[new THREE.BoxGeometry(width, 0.04, length)]}
        />
        <lineBasicMaterial color="#94a3b8" />
      </lineSegments>
    </group>
  );
}

// ─── Fresnel Zone Ellipsoid ─────────────────────────────────────────

function FresnelEllipsoid({
  txPosition,
  rxPosition,
  radius,
  signalQuality,
}: {
  txPosition: [number, number, number];
  rxPosition: [number, number, number];
  radius: number;
  signalQuality: number;
}) {
  const { position, rotation, scaleX } = useMemo(() => {
    const mid: [number, number, number] = [
      (txPosition[0] + rxPosition[0]) / 2,
      (txPosition[1] + rxPosition[1]) / 2,
      (txPosition[2] + rxPosition[2]) / 2,
    ];

    const dx = rxPosition[0] - txPosition[0];
    const dy = rxPosition[1] - txPosition[1];
    const dz = rxPosition[2] - txPosition[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Rotation to align ellipsoid major axis with TX-RX line
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
    const euler = new THREE.Euler().setFromQuaternion(quat);

    return {
      position: mid,
      rotation: [euler.x, euler.y, euler.z] as [number, number, number],
      scaleX: dist / 2,
    };
  }, [txPosition, rxPosition]);

  const color = qualityColor(signalQuality);

  return (
    <mesh position={position} rotation={rotation}>
      <sphereGeometry args={[1, 32, 16]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={0.12}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
      {/* Scale: X/Z = zone radius, Y = half TX-RX distance */}
      <primitive
        object={new THREE.Object3D()}
        scale={[radius, scaleX, radius]}
      />
    </mesh>
  );
}

// ─── TX → RX line ───────────────────────────────────────────────────

function TxRxLine({
  txPosition,
  rxPosition,
}: {
  txPosition: [number, number, number];
  rxPosition: [number, number, number];
}) {
  const points = useMemo(
    () => [
      new THREE.Vector3(...txPosition),
      new THREE.Vector3(...rxPosition),
    ],
    [txPosition, rxPosition],
  );
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(points);
    return g;
  }, [points]);

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#475569" linewidth={1} />
    </lineSegments>
  );
}

// ─── HUD overlay ────────────────────────────────────────────────────

function HudOverlay({
  zoneMargin,
  signalQuality,
  presenceDetected,
}: {
  zoneMargin: number;
  signalQuality: number;
  presenceDetected: boolean;
}) {
  const color = qualityColor(signalQuality);
  return (
    <Html fullscreen style={{ pointerEvents: 'none' }}>
      <div className="absolute bottom-4 left-4 rounded-lg bg-slate-900/80 p-3 text-xs text-slate-200 space-y-1">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span>Signal: {qualityLabel(signalQuality)} ({(signalQuality * 100).toFixed(0)}%)</span>
        </div>
        <div>Zone margin: {(zoneMargin * 100).toFixed(0)}%</div>
        <div>Presence: {presenceDetected ? 'Detected' : 'None'}</div>
      </div>
      <div className="absolute bottom-4 right-4 max-w-xs rounded-lg bg-amber-900/70 px-3 py-2 text-[10px] text-amber-200">
        Estimated RF coverage model — not an exact electromagnetic field measurement.
      </div>
    </Html>
  );
}

// ─── Ground grid ────────────────────────────────────────────────────

function GroundGrid() {
  return (
    <gridHelper
      args={[10, 20, '#334155', '#1e293b']}
      position={[0, -0.05, 0]}
    />
  );
}

// ─── Main Component ─────────────────────────────────────────────────

export function StationGeometry({
  txPosition,
  rxPosition,
  treadmillCenter,
  treadmillLength,
  treadmillWidth,
  primaryZoneRadius,
  zoneMargin,
  signalQuality,
  presenceDetected,
}: StationGeometryProps) {
  return (
    <div className="relative h-full w-full min-h-[400px] rounded-lg border border-slate-700 bg-slate-950">
      <Canvas
        camera={{ position: [3, 2.5, 3], fov: 50, near: 0.1, far: 100 }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 5, 5]} intensity={0.6} />

        <GroundGrid />

        <Antenna position={txPosition} color="#f97316" label="TX" />
        <Antenna position={rxPosition} color="#a855f7" label="RX" />
        <TxRxLine txPosition={txPosition} rxPosition={rxPosition} />

        <FresnelEllipsoid
          txPosition={txPosition}
          rxPosition={rxPosition}
          radius={primaryZoneRadius}
          signalQuality={signalQuality}
        />

        <Treadmill
          center={treadmillCenter}
          length={treadmillLength}
          width={treadmillWidth}
          presenceDetected={presenceDetected}
        />

        <HudOverlay
          zoneMargin={zoneMargin}
          signalQuality={signalQuality}
          presenceDetected={presenceDetected}
        />

        <OrbitControls
          enableDamping
          dampingFactor={0.1}
          minDistance={1}
          maxDistance={15}
        />
      </Canvas>
    </div>
  );
}
