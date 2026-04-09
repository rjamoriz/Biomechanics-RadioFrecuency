'use client';

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Html } from '@react-three/drei';
import * as THREE from 'three';

/* ──────────────────────────────────────────────
 * 3D Skeleton Viewer — COCO 17 keypoints.
 *
 * Renders an INFERRED skeleton from Wi-Fi CSI
 * feature extraction. This is NOT optical
 * motion capture.
 * ────────────────────────────────────────────── */

// --- COCO 17 keypoint indices ---
const COCO = {
  NOSE: 0,
  LEFT_EYE: 1,
  RIGHT_EYE: 2,
  LEFT_EAR: 3,
  RIGHT_EAR: 4,
  LEFT_SHOULDER: 5,
  RIGHT_SHOULDER: 6,
  LEFT_ELBOW: 7,
  RIGHT_ELBOW: 8,
  LEFT_WRIST: 9,
  RIGHT_WRIST: 10,
  LEFT_HIP: 11,
  RIGHT_HIP: 12,
  LEFT_KNEE: 13,
  RIGHT_KNEE: 14,
  LEFT_ANKLE: 15,
  RIGHT_ANKLE: 16,
} as const;

// Standard COCO skeleton topology
const BONES: [number, number][] = [
  // Head
  [COCO.NOSE, COCO.LEFT_EYE],
  [COCO.LEFT_EYE, COCO.LEFT_EAR],
  [COCO.NOSE, COCO.RIGHT_EYE],
  [COCO.RIGHT_EYE, COCO.RIGHT_EAR],
  // Torso
  [COCO.LEFT_SHOULDER, COCO.RIGHT_SHOULDER],
  [COCO.LEFT_SHOULDER, COCO.LEFT_HIP],
  [COCO.RIGHT_SHOULDER, COCO.RIGHT_HIP],
  [COCO.LEFT_HIP, COCO.RIGHT_HIP],
  // Left arm
  [COCO.LEFT_SHOULDER, COCO.LEFT_ELBOW],
  [COCO.LEFT_ELBOW, COCO.LEFT_WRIST],
  // Right arm
  [COCO.RIGHT_SHOULDER, COCO.RIGHT_ELBOW],
  [COCO.RIGHT_ELBOW, COCO.RIGHT_WRIST],
  // Left leg
  [COCO.LEFT_HIP, COCO.LEFT_KNEE],
  [COCO.LEFT_KNEE, COCO.LEFT_ANKLE],
  // Right leg
  [COCO.RIGHT_HIP, COCO.RIGHT_KNEE],
  [COCO.RIGHT_KNEE, COCO.RIGHT_ANKLE],
];

// Left-side indices (blue)
const LEFT_INDICES: Set<number> = new Set([
  COCO.LEFT_EYE, COCO.LEFT_EAR, COCO.LEFT_SHOULDER,
  COCO.LEFT_ELBOW, COCO.LEFT_WRIST, COCO.LEFT_HIP,
  COCO.LEFT_KNEE, COCO.LEFT_ANKLE,
]);

// Right-side indices (red)
const RIGHT_INDICES: Set<number> = new Set([
  COCO.RIGHT_EYE, COCO.RIGHT_EAR, COCO.RIGHT_SHOULDER,
  COCO.RIGHT_ELBOW, COCO.RIGHT_WRIST, COCO.RIGHT_HIP,
  COCO.RIGHT_KNEE, COCO.RIGHT_ANKLE,
]);

const COLOR_LEFT = new THREE.Color('#3b82f6');   // blue-500
const COLOR_RIGHT = new THREE.Color('#ef4444');   // red-500
const COLOR_CENTER = new THREE.Color('#f8fafc');  // slate-50 (white-ish)

export interface SkeletonKeypoint {
  x: number;
  y: number;
  z: number;
  confidence: number;
}

export interface SkeletonViewerProps {
  keypoints: SkeletonKeypoint[];
  modelConfidence: number;
  className?: string;
}

function getJointColor(index: number): THREE.Color {
  if (LEFT_INDICES.has(index)) return COLOR_LEFT;
  if (RIGHT_INDICES.has(index)) return COLOR_RIGHT;
  return COLOR_CENTER;
}

function getBoneColor(a: number, b: number): THREE.Color {
  if (LEFT_INDICES.has(a) && LEFT_INDICES.has(b)) return COLOR_LEFT;
  if (RIGHT_INDICES.has(a) && RIGHT_INDICES.has(b)) return COLOR_RIGHT;
  return COLOR_CENTER;
}

function getOpacity(confidence: number): number {
  if (confidence < 0.3) return 0;
  if (confidence < 0.7) return 0.45;
  return 1;
}

/** Single joint sphere with confidence-based opacity. */
function JointSphere({ position, color, confidence }: {
  position: [number, number, number];
  color: THREE.Color;
  confidence: number;
}) {
  const opacity = getOpacity(confidence);
  if (opacity === 0) return null;

  return (
    <mesh position={position}>
      <sphereGeometry args={[0.025, 16, 16]} />
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
}

/** Bone segment connecting two keypoints. */
function BoneSegment({ start, end, color, opacity }: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  color: THREE.Color;
  opacity: number;
}) {
  const { position, quaternion, length } = useMemo(() => {
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    const quat = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    quat.setFromUnitVectors(up, dir.clone().normalize());
    return { position: mid, quaternion: quat, length: len };
  }, [start, end]);

  if (opacity === 0) return null;

  return (
    <mesh position={position} quaternion={quaternion}>
      <cylinderGeometry args={[0.008, 0.008, length, 8]} />
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
}

/** The 3D skeleton scene contents (rendered inside Canvas). */
function SkeletonScene({ keypoints, modelConfidence }: {
  keypoints: SkeletonKeypoint[];
  modelConfidence: number;
}) {
  const positions = useMemo(
    () => keypoints.map((kp) => new THREE.Vector3(kp.x, kp.y, kp.z)),
    [keypoints],
  );

  const confidenceColor =
    modelConfidence >= 0.7 ? 'text-green-400' :
    modelConfidence >= 0.4 ? 'text-amber-400' :
    'text-red-400';

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />

      {/* Joint spheres */}
      {keypoints.map((kp, i) => (
        <JointSphere
          key={i}
          position={[kp.x, kp.y, kp.z]}
          color={getJointColor(i)}
          confidence={kp.confidence}
        />
      ))}

      {/* Bone segments */}
      {BONES.map(([a, b]) => {
        if (a >= keypoints.length || b >= keypoints.length) return null;
        const minConf = Math.min(keypoints[a].confidence, keypoints[b].confidence);
        const opacity = getOpacity(minConf);
        return (
          <BoneSegment
            key={`${a}-${b}`}
            start={positions[a]}
            end={positions[b]}
            color={getBoneColor(a, b)}
            opacity={opacity}
          />
        );
      })}

      {/* Ground grid */}
      <Grid
        args={[4, 4]}
        cellSize={0.25}
        cellThickness={0.5}
        cellColor="#94a3b8"
        sectionSize={1}
        sectionThickness={1}
        sectionColor="#64748b"
        fadeDistance={6}
        position={[0, 0, 0]}
      />

      {/* Confidence HUD overlay */}
      <Html position={[0, 2.1, 0]} center distanceFactor={4}>
        <div className="pointer-events-none select-none whitespace-nowrap rounded-full bg-slate-900/80 px-3 py-1 text-xs font-medium backdrop-blur">
          <span className="text-slate-300">Model Confidence: </span>
          <span className={confidenceColor}>
            {Math.round(modelConfidence * 100)}%
          </span>
        </div>
      </Html>

      <OrbitControls
        enableDamping
        dampingFactor={0.1}
        minDistance={1}
        maxDistance={8}
        target={[0, 0.9, 0]}
      />
    </>
  );
}

/**
 * 3D Skeleton Viewer — renders inferred COCO 17-keypoint skeleton.
 *
 * This visualization is SYNTHETIC and INFERRED from Wi-Fi CSI features.
 * It is not a camera capture.
 */
export function SkeletonViewer({ keypoints, modelConfidence, className }: SkeletonViewerProps) {
  return (
    <div
      className={className}
      data-testid="skeleton-viewer"
      data-output-class="inferred-motion"
      data-synthetic="true"
    >
      <Canvas
        camera={{ position: [0, 1.2, 3], fov: 50 }}
        gl={{ antialias: true }}
        style={{ background: '#0f172a' }}
      >
        <SkeletonScene keypoints={keypoints} modelConfidence={modelConfidence} />
      </Canvas>
    </div>
  );
}
