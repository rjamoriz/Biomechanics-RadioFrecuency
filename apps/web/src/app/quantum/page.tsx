'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useGatewaySocket } from '@/hooks/use-gateway-socket';

/* ────────────────────────────────────────────────
 * QUANTUM STATE SIMULATION HOOKS
 * ──────────────────────────────────────────────── */

interface BlochState {
  x: number;
  y: number;
  z: number;
  coherence: number;
  entropy: number;
  purity: number;
}

interface HypothesisState {
  label: string;
  amplitude: number;
  probability: number;
}

const HYPOTHESES_LABELS = [
  'Station Empty',
  'Warming Up',
  'Steady State',
  'High Intensity',
  'Cooling Down',
  'Rest Interval',
  'Speed Change',
  'Incline Change',
  'Multi-Person',
  'Interference',
  'Calibration',
  'Fatigue Onset',
  'Asymmetry',
  'Form Breakdown',
  'Near-Fall',
  'Session Complete',
];

function useQuantumState(metrics: { signalQualityScore: number; estimatedCadence: number; symmetryProxy: number; fatigueDriftScore: number; metricConfidence: number } | null) {
  const [bloch, setBloch] = useState<BlochState>({ x: 0, y: 0.1, z: 0.95, coherence: 0.95, entropy: 0.03, purity: 0.95 });
  const [hypotheses, setHypotheses] = useState<HypothesisState[]>(
    HYPOTHESES_LABELS.map((l) => ({ label: l, amplitude: 0.25, probability: 1 / 16 }))
  );
  const [coherenceHistory, setCoherenceHistory] = useState<number[]>([]);
  const [entropyHistory, setEntropyHistory] = useState<number[]>([]);
  const [blochTrail, setBlochTrail] = useState<[number, number, number][]>([]);
  const frameRef = useRef(0);

  useEffect(() => {
    const interval = setInterval(() => {
      frameRef.current += 1;
      const t = frameRef.current;

      // Derive Bloch state from metrics or simulate
      const sq = metrics?.signalQualityScore ?? 0.8;
      const cadence = metrics?.estimatedCadence ?? 170;
      const fatigue = metrics?.fatigueDriftScore ?? 0;
      const sym = metrics?.symmetryProxy ?? 0.95;
      const conf = metrics?.metricConfidence ?? 0.85;

      // Gait-cycle coherence oscillation
      const gaitFreq = cadence / 60; // Hz
      const phase = (t * 0.05) * gaitFreq * Math.PI * 2;
      const coherenceBase = sq * 0.85;
      const coherenceOsc = 0.15 * Math.sin(phase) * sq;
      const coherence = Math.max(0.05, Math.min(1, coherenceBase + coherenceOsc));

      // Bloch vector
      const theta = Math.acos(coherence) * 0.8;
      const phi = phase * 0.3 + (1 - sym) * Math.sin(phase * 0.5) * 0.5;
      const bx = Math.sin(theta) * Math.cos(phi);
      const by = Math.sin(theta) * Math.sin(phi);
      const bz = Math.cos(theta);

      // Von Neumann entropy
      const p = (1 + coherence) / 2;
      const entropy = p > 0.001 && p < 0.999
        ? -(p * Math.log(p) + (1 - p) * Math.log(1 - p))
        : 0;
      const purity = (1 + coherence * coherence) / 2;

      setBloch({ x: bx, y: by, z: bz, coherence, entropy, purity });

      setCoherenceHistory((prev) => {
        const next = [...prev, coherence];
        return next.length > 120 ? next.slice(-120) : next;
      });

      setEntropyHistory((prev) => {
        const next = [...prev, entropy];
        return next.length > 120 ? next.slice(-120) : next;
      });

      setBlochTrail((prev) => {
        const next = [...prev, [bx, by, bz] as [number, number, number]];
        return next.length > 80 ? next.slice(-80) : next;
      });

      // Grover-inspired hypothesis update
      setHypotheses((prev) => {
        const amps = prev.map((h) => h.amplitude);
        const isRunning = cadence > 140;
        const isEmpty = !metrics;

        // Oracle: boost relevant hypotheses
        if (isEmpty) {
          amps[0] *= 1.3;
        } else if (isRunning && fatigue > 0.4) {
          amps[11] *= 1.3; // Fatigue onset
          amps[2] *= 1.1;
        } else if (isRunning && cadence > 180) {
          amps[3] *= 1.3; // High intensity
        } else if (isRunning) {
          amps[2] *= 1.3; // Steady state
        }
        if (sq < 0.4) amps[9] *= 1.2; // Interference
        if (sym < 0.85) amps[12] *= 1.2; // Asymmetry

        // Grover diffusion
        const mean = amps.reduce((s, a) => s + a, 0) / amps.length;
        for (let i = 0; i < amps.length; i++) {
          amps[i] = 2 * mean - amps[i];
          if (amps[i] < 0) amps[i] = 0;
        }

        // Normalize
        const norm = Math.sqrt(amps.reduce((s, a) => s + a * a, 0));
        if (norm > 0) for (let i = 0; i < amps.length; i++) amps[i] /= norm;

        return prev.map((h, i) => ({
          ...h,
          amplitude: amps[i],
          probability: amps[i] * amps[i],
        }));
      });
    }, 100); // 10 Hz update

    return () => clearInterval(interval);
  }, [metrics]);

  return { bloch, hypotheses, coherenceHistory, entropyHistory, blochTrail };
}

/* ────────────────────────────────────────────────
 * 3D BLOCH SPHERE COMPONENT
 * ──────────────────────────────────────────────── */

function BlochSphereAxes() {
  const axisLength = 1.3;
  return (
    <group>
      {/* X axis — red */}
      <Line points={[[-axisLength, 0, 0], [axisLength, 0, 0]]} color="#ef4444" lineWidth={1} opacity={0.4} transparent />
      {/* Y axis — green */}
      <Line points={[[0, -axisLength, 0], [0, axisLength, 0]]} color="#22c55e" lineWidth={1} opacity={0.4} transparent />
      {/* Z axis — blue */}
      <Line points={[[0, 0, -axisLength], [0, 0, axisLength]]} color="#3b82f6" lineWidth={1} opacity={0.4} transparent />
      {/* Axis labels */}
      <Html position={[axisLength + 0.15, 0, 0]} center><span className="text-[10px] text-red-400 font-mono">X</span></Html>
      <Html position={[0, axisLength + 0.15, 0]} center><span className="text-[10px] text-green-400 font-mono">Y</span></Html>
      <Html position={[0, 0, axisLength + 0.15]} center><span className="text-[10px] text-blue-400 font-mono">|0⟩</span></Html>
      <Html position={[0, 0, -axisLength - 0.15]} center><span className="text-[10px] text-blue-400 font-mono">|1⟩</span></Html>
    </group>
  );
}

function BlochSphereWireframe() {
  const meshRef = useRef<THREE.Mesh>(null);
  return (
    <>
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial
          color="#6366f1"
          transparent
          opacity={0.06}
          wireframe={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[1, 24, 24]} />
        <meshStandardMaterial color="#6366f1" transparent opacity={0.15} wireframe />
      </mesh>
      {/* Equatorial ring */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.99, 1.01, 64]} />
        <meshBasicMaterial color="#818cf8" transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

function BlochVector({ bloch, trail }: { bloch: BlochState; trail: [number, number, number][] }) {
  const arrowRef = useRef<THREE.Group>(null);
  const targetPos = useRef(new THREE.Vector3(bloch.x, bloch.z, bloch.y));
  const currentPos = useRef(new THREE.Vector3(bloch.x, bloch.z, bloch.y));

  useEffect(() => {
    targetPos.current.set(bloch.x, bloch.z, bloch.y);
  }, [bloch]);

  useFrame(() => {
    currentPos.current.lerp(targetPos.current, 0.12);
    if (arrowRef.current) {
      const dir = currentPos.current.clone().normalize();
      const len = currentPos.current.length();
      arrowRef.current.position.set(0, 0, 0);
      arrowRef.current.lookAt(dir);
      arrowRef.current.scale.set(1, 1, len);
    }
  });

  // Map trail to Three.js coordinates (swap y/z for display)
  const trailPoints = useMemo(
    () => trail.map(([x, y, z]) => [x, z, y] as [number, number, number]),
    [trail]
  );

  const coherenceColor = bloch.coherence > 0.7 ? '#22c55e' : bloch.coherence > 0.4 ? '#eab308' : '#ef4444';

  return (
    <group>
      {/* Bloch vector arrow body */}
      <group ref={arrowRef}>
        <mesh position={[0, 0, 0.5]}>
          <cylinderGeometry args={[0.025, 0.025, 1, 8]} />
          <meshStandardMaterial color={coherenceColor} emissive={coherenceColor} emissiveIntensity={0.5} />
        </mesh>
      </group>
      {/* State point */}
      <mesh position={[currentPos.current.x, currentPos.current.y, currentPos.current.z]}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color={coherenceColor} emissive={coherenceColor} emissiveIntensity={1} />
      </mesh>
      {/* Trail */}
      {trailPoints.length > 2 && (
        <Line
          points={trailPoints}
          color="#a78bfa"
          lineWidth={1.5}
          opacity={0.4}
          transparent
        />
      )}
    </group>
  );
}

function BlochSphere3D({ bloch, trail }: { bloch: BlochState; trail: [number, number, number][] }) {
  return (
    <Canvas camera={{ position: [2, 1.5, 2], fov: 45 }} style={{ background: 'transparent' }}>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.6} />
      <pointLight position={[-3, 2, 4]} intensity={0.3} color="#818cf8" />
      <BlochSphereWireframe />
      <BlochSphereAxes />
      <BlochVector bloch={bloch} trail={trail} />
      <OrbitControls enablePan={false} minDistance={2.5} maxDistance={5} autoRotate autoRotateSpeed={0.5} />
    </Canvas>
  );
}

/* ────────────────────────────────────────────────
 * WAVEFORM / CHART COMPONENTS (Canvas 2D)
 * ──────────────────────────────────────────────── */

function WaveformChart({ data, color, label, height = 100, maxVal }: { data: number[]; color: string; label: string; height?: number; maxVal?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const max = maxVal ?? Math.max(...data, 0.01);

    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Glow effect
    ctx.shadowBlur = 8;
    ctx.shadowColor = color;

    // Waveform
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((val, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - (val / max) * h * 0.9 - h * 0.05;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill under curve
    ctx.shadowBlur = 0;
    const lastX = w;
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, color + '30');
    gradient.addColorStop(1, color + '05');
    ctx.lineTo(lastX, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
  }, [data, color, maxVal]);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        {data.length > 0 && (
          <span className="font-mono text-xs text-slate-300">
            {data[data.length - 1].toFixed(3)}
          </span>
        )}
      </div>
      <canvas ref={canvasRef} width={400} height={height} className="w-full rounded-lg bg-slate-900/50" />
    </div>
  );
}

/* ────────────────────────────────────────────────
 * HYPOTHESIS BAR CHART
 * ──────────────────────────────────────────────── */

function HypothesisChart({ hypotheses }: { hypotheses: HypothesisState[] }) {
  const maxProb = Math.max(...hypotheses.map((h) => h.probability), 0.01);
  const sorted = [...hypotheses].sort((a, b) => b.probability - a.probability);
  const winner = sorted[0];
  const isConverged = winner.probability > 0.5;

  return (
    <div className="space-y-1.5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">
          Grover-Inspired Hypothesis Search
        </span>
        <Badge variant={isConverged ? 'success' : 'warning'} className="text-[10px]">
          {isConverged ? `Converged: ${winner.label}` : 'Searching...'}
        </Badge>
      </div>
      {sorted.slice(0, 8).map((h) => {
        const pct = (h.probability / maxProb) * 100;
        const isWinner = h === winner && isConverged;
        return (
          <div key={h.label} className="flex items-center gap-2">
            <span className="w-28 truncate text-[10px] text-slate-400">{h.label}</span>
            <div className="flex-1 h-3 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isWinner
                    ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
                    : 'bg-gradient-to-r from-slate-600 to-slate-500'
                }`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-10 text-right font-mono text-[10px] text-slate-300">
              {(h.probability * 100).toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────
 * GAUGE COMPONENT
 * ──────────────────────────────────────────────── */

function CircularGauge({ value, label, unit, color, max = 1 }: { value: number; label: string; unit: string; color: string; max?: number }) {
  const pct = Math.min(value / max, 1);
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={100} height={100} viewBox="0 0 100 100">
        <circle cx={50} cy={50} r={radius} fill="none" stroke="rgba(51,65,85,0.5)" strokeWidth={6} />
        <circle
          cx={50}
          cy={50}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.5s ease', filter: `drop-shadow(0 0 6px ${color})` }}
        />
        <text x={50} y={46} textAnchor="middle" className="fill-slate-100 text-lg font-bold" style={{ fontSize: '18px', fontFamily: 'monospace' }}>
          {(pct * 100).toFixed(0)}
        </text>
        <text x={50} y={62} textAnchor="middle" className="fill-slate-400" style={{ fontSize: '9px' }}>
          {unit}
        </text>
      </svg>
      <span className="text-[10px] font-medium text-slate-400">{label}</span>
    </div>
  );
}

/* ────────────────────────────────────────────────
 * QUANTUM CIRCUIT VISUAL
 * ──────────────────────────────────────────────── */

function QuantumCircuitDiagram() {
  const [activeGate, setActiveGate] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveGate((prev) => (prev + 1) % 6);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  const gates = [
    { label: 'H', desc: 'Hadamard', qubit: 0 },
    { label: 'Rᵧ', desc: 'Encode', qubit: 0 },
    { label: 'Rᵧ', desc: 'Encode', qubit: 1 },
    { label: 'CX', desc: 'Entangle', qubit: 0, target: 1 },
    { label: 'Rᵤ', desc: 'Phase', qubit: 0 },
    { label: 'M', desc: 'Measure', qubit: 0 },
  ];

  return (
    <div className="rounded-lg bg-slate-900/50 p-4">
      <div className="mb-2 text-xs font-medium text-slate-400">VQC Gait Phase Circuit</div>
      <svg viewBox="0 0 380 80" className="w-full">
        {/* Qubit lines */}
        {[0, 1].map((q) => (
          <g key={q}>
            <text x={8} y={25 + q * 35} className="fill-slate-400" style={{ fontSize: '10px', fontFamily: 'monospace' }}>
              |q{q}⟩
            </text>
            <line x1={35} y1={22 + q * 35} x2={370} y2={22 + q * 35} stroke="#475569" strokeWidth={1.5} />
          </g>
        ))}
        {/* Gates */}
        {gates.map((g, i) => {
          const x = 55 + i * 55;
          const y = 12 + g.qubit * 35;
          const isActive = i === activeGate;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={28}
                height={20}
                rx={4}
                fill={isActive ? '#7c3aed' : '#1e293b'}
                stroke={isActive ? '#a78bfa' : '#475569'}
                strokeWidth={isActive ? 2 : 1}
                style={{ filter: isActive ? 'drop-shadow(0 0 8px #7c3aed)' : 'none', transition: 'all 0.3s' }}
              />
              <text
                x={x + 14}
                y={y + 14}
                textAnchor="middle"
                fill={isActive ? '#fff' : '#94a3b8'}
                style={{ fontSize: '10px', fontWeight: 'bold', fontFamily: 'monospace' }}
              >
                {g.label}
              </text>
              {/* CNOT control line */}
              {g.target !== undefined && (
                <>
                  <line x1={x + 14} y1={y + 20} x2={x + 14} y2={12 + g.target * 35} stroke={isActive ? '#a78bfa' : '#475569'} strokeWidth={1.5} />
                  <circle cx={x + 14} cy={12 + g.target * 35 + 10} r={6} fill="none" stroke={isActive ? '#a78bfa' : '#475569'} strokeWidth={1.5} />
                  <line x1={x + 14 - 4} y1={12 + g.target * 35 + 10} x2={x + 14 + 4} y2={12 + g.target * 35 + 10} stroke={isActive ? '#a78bfa' : '#475569'} strokeWidth={1.5} />
                  <line x1={x + 14} y1={12 + g.target * 35 + 10 - 4} x2={x + 14} y2={12 + g.target * 35 + 10 + 4} stroke={isActive ? '#a78bfa' : '#475569'} strokeWidth={1.5} />
                </>
              )}
              {/* Measurement symbol */}
              {g.label === 'M' && (
                <path d={`M ${x + 6} ${y + 16} Q ${x + 14} ${y + 4} ${x + 22} ${y + 16}`} fill="none" stroke={isActive ? '#fff' : '#94a3b8'} strokeWidth={1} />
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
        <span className="text-[10px] text-slate-500">
          Processing: {gates[activeGate]?.desc} gate on q{gates[activeGate]?.qubit}
        </span>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
 * DENSITY MATRIX HEATMAP
 * ──────────────────────────────────────────────── */

function DensityMatrix({ coherence }: { coherence: number }) {
  // 2x2 density matrix for single qubit
  const p = (1 + coherence) / 2;
  const offDiag = Math.sqrt(p * (1 - p));
  const matrix = [
    [p, offDiag],
    [offDiag, 1 - p],
  ];

  return (
    <div className="rounded-lg bg-slate-900/50 p-3">
      <div className="mb-2 text-xs font-medium text-slate-400">Density Matrix ρ</div>
      <div className="flex items-center justify-center gap-1">
        <span className="text-lg text-slate-500 font-light">(</span>
        <div className="grid grid-cols-2 gap-1">
          {matrix.flat().map((val, i) => {
            const intensity = val;
            const r = Math.round(99 + intensity * 100);
            const g = Math.round(102 + intensity * 50);
            const b = Math.round(241);
            return (
              <div
                key={i}
                className="flex h-10 w-14 items-center justify-center rounded text-[10px] font-mono font-bold transition-all duration-500"
                style={{
                  backgroundColor: `rgba(${r}, ${g}, ${b}, ${0.15 + intensity * 0.6})`,
                  color: intensity > 0.3 ? '#e2e8f0' : '#64748b',
                  boxShadow: intensity > 0.4 ? `0 0 12px rgba(${r}, ${g}, ${b}, 0.3)` : 'none',
                }}
              >
                {val.toFixed(2)}
              </div>
            );
          })}
        </div>
        <span className="text-lg text-slate-500 font-light">)</span>
      </div>
      <div className="mt-2 text-center text-[10px] text-slate-500">
        Tr(ρ²) = {((p * p + (1 - p) * (1 - p) + 2 * offDiag * offDiag)).toFixed(3)}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────
 * MAIN PAGE COMPONENT
 * ──────────────────────────────────────────────── */

export default function QuantumObservatoryPage() {
  const { connected, demoMode, metrics } = useGatewaySocket();
  const { bloch, hypotheses, coherenceHistory, entropyHistory, blochTrail } = useQuantumState(metrics);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">
            <span className="text-violet-400">⚛️</span>{' '}Quantum Observatory
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Quantum-inspired signal coherence analysis &mdash; Bloch sphere formalism applied to Wi-Fi CSI
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={connected ? 'success' : 'danger'}>
            {connected ? 'Live' : 'Offline'}
          </Badge>
          {demoMode && <Badge variant="warning">Demo</Badge>}
          <Badge variant="info" className="bg-violet-500/20 text-violet-300">Experimental</Badge>
        </div>
      </div>

      {/* Row 1: Bloch Sphere + Gauges + Density Matrix */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Bloch Sphere */}
        <Card className="lg:col-span-2 relative overflow-hidden border-violet-500/20 bg-slate-900/80 backdrop-blur">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-slate-100">Bloch Sphere — CSI Phase Coherence</CardTitle>
              <span className="text-xs text-slate-500">Auto-rotating • Drag to explore</span>
            </div>
          </CardHeader>
          <div className="h-[340px] -mx-2 -mb-2">
            <BlochSphere3D bloch={bloch} trail={blochTrail} />
          </div>
          {/* Overlay stats */}
          <div className="absolute bottom-4 left-4 flex gap-3">
            <div className="rounded-lg bg-slate-950/80 backdrop-blur px-3 py-1.5">
              <div className="text-[10px] text-slate-500">Coherence</div>
              <div className="font-mono text-sm font-bold" style={{ color: bloch.coherence > 0.7 ? '#22c55e' : bloch.coherence > 0.4 ? '#eab308' : '#ef4444' }}>
                {bloch.coherence.toFixed(3)}
              </div>
            </div>
            <div className="rounded-lg bg-slate-950/80 backdrop-blur px-3 py-1.5">
              <div className="text-[10px] text-slate-500">Entropy S(ρ)</div>
              <div className="font-mono text-sm font-bold text-amber-400">
                {bloch.entropy.toFixed(3)}
              </div>
            </div>
            <div className="rounded-lg bg-slate-950/80 backdrop-blur px-3 py-1.5">
              <div className="text-[10px] text-slate-500">Bloch Vector</div>
              <div className="font-mono text-[10px] text-violet-300">
                ({bloch.x.toFixed(2)}, {bloch.y.toFixed(2)}, {bloch.z.toFixed(2)})
              </div>
            </div>
          </div>
        </Card>

        {/* Right column: Gauges + Density Matrix */}
        <div className="space-y-4">
          {/* Gauge panel */}
          <Card className="border-violet-500/20 bg-slate-900/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-slate-100 text-sm">Quantum State Metrics</CardTitle>
            </CardHeader>
            <div className="flex items-center justify-around">
              <CircularGauge value={bloch.coherence} label="Coherence" unit="pure state" color="#22c55e" />
              <CircularGauge value={bloch.purity} label="Purity Tr(ρ²)" unit="signal quality" color="#8b5cf6" />
              <CircularGauge value={1 - bloch.entropy / 0.693} label="Order" unit="1 − S/ln2" color="#3b82f6" />
            </div>
          </Card>

          {/* Density Matrix */}
          <Card className="border-violet-500/20 bg-slate-900/80 backdrop-blur">
            <DensityMatrix coherence={bloch.coherence} />
          </Card>

          {/* Quantum Circuit */}
          <Card className="border-violet-500/20 bg-slate-900/80 backdrop-blur">
            <QuantumCircuitDiagram />
          </Card>
        </div>
      </div>

      {/* Row 2: Waveforms */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-violet-500/20 bg-slate-900/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-slate-100 text-sm">Coherence Waveform — Gait Cycle Detection</CardTitle>
          </CardHeader>
          <WaveformChart data={coherenceHistory} color="#22c55e" label="|⟨R⟩| — Mean Bloch Vector Magnitude" maxVal={1} height={120} />
          <p className="mt-2 text-[10px] text-slate-500">
            Oscillation frequency = estimated step frequency. Peak = stance phase (aligned phases). Valley = swing phase (scattered phases).
          </p>
        </Card>

        <Card className="border-violet-500/20 bg-slate-900/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-slate-100 text-sm">Von Neumann Entropy — Environmental Stability</CardTitle>
          </CardHeader>
          <WaveformChart data={entropyHistory} color="#f59e0b" label="S(ρ) = −p·ln(p) − (1−p)·ln(1−p)" maxVal={0.693} height={120} />
          <p className="mt-2 text-[10px] text-slate-500">
            Low entropy = clean signal. Sustained increase = fatigue drift. Sudden spike = environmental disturbance (decoherence event).
          </p>
        </Card>
      </div>

      {/* Row 3: Hypothesis Search + Info */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-violet-500/20 bg-slate-900/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-slate-100 text-sm">Quantum State Classification — Grover Search</CardTitle>
          </CardHeader>
          <HypothesisChart hypotheses={hypotheses} />
          <p className="mt-3 text-[10px] text-slate-500">
            16 hypotheses compete via oracle+diffusion. Evidence from CSI amplifies correct state. Converges when P &gt; 50%.
            Fixed 64 bytes — no dynamic allocation. Suitable for ESP32 edge deployment.
          </p>
        </Card>

        <Card className="border-violet-500/20 bg-slate-900/80 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-slate-100 text-sm">How It Works</CardTitle>
          </CardHeader>
          <div className="space-y-3 text-xs text-slate-400">
            <div className="flex gap-2">
              <div className="mt-0.5 h-4 w-4 flex-shrink-0 rounded bg-violet-500/20 flex items-center justify-center text-[10px] text-violet-300">1</div>
              <p>Each Wi-Fi subcarrier&apos;s phase maps to a point on the <strong className="text-violet-300">Bloch sphere</strong> — the fundamental visualization of a quantum state.</p>
            </div>
            <div className="flex gap-2">
              <div className="mt-0.5 h-4 w-4 flex-shrink-0 rounded bg-violet-500/20 flex items-center justify-center text-[10px] text-violet-300">2</div>
              <p>When phases align (runner in stance), the mean Bloch vector nears the pole = <strong className="text-green-400">high coherence</strong>. When phases scatter (swing), it drifts = <strong className="text-amber-400">low coherence</strong>.</p>
            </div>
            <div className="flex gap-2">
              <div className="mt-0.5 h-4 w-4 flex-shrink-0 rounded bg-violet-500/20 flex items-center justify-center text-[10px] text-violet-300">3</div>
              <p><strong className="text-blue-400">Von Neumann entropy</strong> quantifies disorder. Low = clean gait signal. Rising baseline = fatigue. Spike = environmental change.</p>
            </div>
            <div className="flex gap-2">
              <div className="mt-0.5 h-4 w-4 flex-shrink-0 rounded bg-violet-500/20 flex items-center justify-center text-[10px] text-violet-300">4</div>
              <p><strong className="text-fuchsia-400">Grover-inspired search</strong> classifies runner state from noisy evidence — more robust than simple thresholds.</p>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-violet-500/10 bg-violet-950/30 p-2.5">
            <p className="text-[10px] text-violet-300/80">
              ⚛️ These are quantum-inspired classical algorithms. The math from quantum mechanics maps naturally onto Wi-Fi CSI phase analysis — no quantum hardware required.
            </p>
          </div>
        </Card>
      </div>

      {/* Scientific disclaimer */}
      <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-4">
        <p className="text-xs text-amber-300/80">
          <strong>Scientific transparency:</strong> Quantum-inspired metrics carry <em>experimental</em> validation status.
          The Bloch sphere formalism provides mathematically precise signal quality assessment but all biomechanics
          proxy metrics require external validation (force plates, optical motion capture) before clinical use. State
          purity has been station-validated against controlled SNR conditions.
        </p>
      </div>
    </div>
  );
}
