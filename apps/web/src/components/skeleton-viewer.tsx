'use client';

import { useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Html } from '@react-three/drei';
import * as THREE from 'three';
import type { JointKinematicsFrame } from '@/hooks/use-gateway-socket';

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

const COLOR_LEFT   = new THREE.Color('#22d3ee'); // cyan-400  — left side
const COLOR_RIGHT  = new THREE.Color('#f97316'); // orange-500 — right side (no conflict with risk-red)
const COLOR_CENTER = new THREE.Color('#94a3b8'); // slate-400  — torso / midline

// Mapping from JointKinematicsFrame joint keys to COCO 17 keypoint indices
const JOINT_KEYPOINT_MAP: {
  jointKey: keyof JointKinematicsFrame['joints'];
  keypointIndex: number;
  label: string;
  maxForceN: number;
}[] = [
  { jointKey: 'leftHip',    keypointIndex: COCO.LEFT_HIP,    label: 'L Hip',    maxForceN: 2000 },
  { jointKey: 'rightHip',   keypointIndex: COCO.RIGHT_HIP,   label: 'R Hip',    maxForceN: 2000 },
  { jointKey: 'leftKnee',   keypointIndex: COCO.LEFT_KNEE,   label: 'L Knee',   maxForceN: 3000 },
  { jointKey: 'rightKnee',  keypointIndex: COCO.RIGHT_KNEE,  label: 'R Knee',   maxForceN: 3000 },
  { jointKey: 'leftAnkle',  keypointIndex: COCO.LEFT_ANKLE,  label: 'L Ankle',  maxForceN: 2500 },
  { jointKey: 'rightAnkle', keypointIndex: COCO.RIGHT_ANKLE, label: 'R Ankle',  maxForceN: 2500 },
];

const RISK_HALO_COLOR: Record<string, THREE.Color> = {
  normal:   new THREE.Color('#34d399'), // emerald-400 — brighter on dark bg
  elevated: new THREE.Color('#fbbf24'), // amber-400   — brighter on dark bg
  high:     new THREE.Color('#f87171'), // red-400     — clearly distinct from orange-right-side
};

export interface SkeletonKeypoint {
  x: number;
  y: number;
  z: number;
  confidence: number;
}

export interface SkeletonViewerProps {
  keypoints: SkeletonKeypoint[];
  modelConfidence: number;
  jointKinematics?: JointKinematicsFrame | null;
  className?: string;
}

/** Pulsing halo sphere around a joint — size and color encode load magnitude and risk. */
function JointLoadHalo({ position, forceN, riskLevel, maxForceN }: {
  position: [number, number, number];
  forceN: number;
  riskLevel: 'normal' | 'elevated' | 'high';
  maxForceN: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const color = RISK_HALO_COLOR[riskLevel] ?? RISK_HALO_COLOR.normal;
  const baseRadius = 0.04 + (forceN / maxForceN) * 0.08;
  const freq = riskLevel === 'high' ? 5 : riskLevel === 'elevated' ? 3.5 : 2.5;
  const amplitude = riskLevel === 'high' ? 0.22 : 0.14;

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * freq) * amplitude;
    meshRef.current.scale.setScalar(baseRadius * pulse);
  });

  return (
    <mesh ref={meshRef} position={position}>
      <sphereGeometry args={[1, 12, 12]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={riskLevel === 'high' ? 0.5 : 0.28}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Floating HTML label at a joint showing proxy force and risk level. */
function JointLoadLabel({ position, label, forceN, angleProxyDeg, riskLevel }: {
  position: [number, number, number];
  label: string;
  forceN: number;
  angleProxyDeg: number;
  riskLevel: 'normal' | 'elevated' | 'high';
}) {
  const colorClass =
    riskLevel === 'high'     ? 'text-red-400' :
    riskLevel === 'elevated' ? 'text-amber-400' :
    'text-emerald-400';
  return (
    <Html
      position={[position[0] + 0.18, position[1] + 0.04, position[2]]}
      distanceFactor={3.5}
    >
      <div className="pointer-events-none select-none rounded bg-slate-900/85 px-1.5 py-0.5 backdrop-blur-sm leading-tight">
        <div className="text-[9px] text-slate-400">{label}</div>
        <div className={`text-[11px] font-bold ${colorClass}`}>{forceN.toFixed(0)} N</div>
        <div className="text-[9px] text-slate-500">{angleProxyDeg.toFixed(0)}°</div>
      </div>
    </Html>
  );
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
  if (confidence < 0.7) return 0.65;
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
      <sphereGeometry args={[0.033, 16, 16]} />
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
      <cylinderGeometry args={[0.011, 0.011, length, 8]} />
      <meshStandardMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
      />
    </mesh>
  );
}

/** The 3D skeleton scene contents with frame interpolation for smooth motion. */
function SkeletonScene({ keypoints, modelConfidence, jointKinematics }: {
  keypoints: SkeletonKeypoint[];
  modelConfidence: number;
  jointKinematics?: JointKinematicsFrame | null;
}) {
  // Keep target keypoints in a ref (updated from props without re-render)
  const targetRef = useRef<SkeletonKeypoint[]>(keypoints);
  targetRef.current = keypoints;

  // Smoothly interpolated positions — updated every animation frame
  const smoothedRef = useRef<SkeletonKeypoint[]>(
    keypoints.map((kp) => ({ ...kp })),
  );

  // Re-sync array length if keypoint count changes
  if (smoothedRef.current.length !== keypoints.length) {
    smoothedRef.current = keypoints.map((kp) => ({ ...kp }));
  }

  // Trigger React re-renders in sync with rAF for smooth visuals
  const [, setRenderTick] = useState(0);

  useFrame(() => {
    const target = targetRef.current;
    const smoothed = smoothedRef.current;
    const lerpFactor = 0.18;

    for (let i = 0; i < target.length && i < smoothed.length; i++) {
      smoothed[i].x += (target[i].x - smoothed[i].x) * lerpFactor;
      smoothed[i].y += (target[i].y - smoothed[i].y) * lerpFactor;
      smoothed[i].z += (target[i].z - smoothed[i].z) * lerpFactor;
      smoothed[i].confidence = target[i].confidence;
    }

    setRenderTick((t) => t + 1);
  });

  const kps = smoothedRef.current;
  const positions = kps.map((kp) => new THREE.Vector3(kp.x, kp.y, kp.z));

  const confidenceColor =
    modelConfidence >= 0.7 ? 'text-green-400' :
    modelConfidence >= 0.4 ? 'text-amber-400' :
    'text-red-400';

  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} />
      <directionalLight position={[-3, 6, -4]} intensity={0.4} />

      {/* Joint spheres */}
      {kps.map((kp, i) => (
        <JointSphere
          key={i}
          position={[kp.x, kp.y, kp.z]}
          color={getJointColor(i)}
          confidence={kp.confidence}
        />
      ))}

      {/* Bone segments */}
      {BONES.map(([a, b]) => {
        if (a >= kps.length || b >= kps.length) return null;
        const minConf = Math.min(kps[a].confidence, kps[b].confidence);
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

      {/* Joint load overlays — pulsing halos and force labels at key joints */}
      {jointKinematics && JOINT_KEYPOINT_MAP.map(({ jointKey, keypointIndex, label, maxForceN }) => {
        const joint = jointKinematics.joints[jointKey];
        const kp = kps[keypointIndex];
        if (!kp || kp.confidence < 0.3) return null;
        const pos: [number, number, number] = [kp.x, kp.y, kp.z];
        return (
          <group key={jointKey}>
            <JointLoadHalo
              position={pos}
              forceN={joint.forceProxyN}
              riskLevel={joint.riskLevel}
              maxForceN={maxForceN}
            />
            <JointLoadLabel
              position={pos}
              label={label}
              forceN={joint.forceProxyN}
              angleProxyDeg={joint.angleProxyDeg}
              riskLevel={joint.riskLevel}
            />
          </group>
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
      <Html position={[0, 1.9, 0]} center distanceFactor={4}>
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
export function SkeletonViewer({ keypoints, modelConfidence, jointKinematics, className }: SkeletonViewerProps) {
  return (
    <div
      className={className}
      data-testid="skeleton-viewer"
      data-output-class="inferred-motion"
      data-synthetic="true"
    >
      <Canvas
        camera={{ position: [0.6, 1.0, 2.8], fov: 50 }}
        gl={{ antialias: true }}
        style={{ background: '#0f172a' }}
      >
        <SkeletonScene
          keypoints={keypoints}
          modelConfidence={modelConfidence}
          jointKinematics={jointKinematics}
        />
      </Canvas>
    </div>
  );
}
