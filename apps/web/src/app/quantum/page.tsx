'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Line } from '@react-three/drei';
import * as THREE from 'three';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useGatewaySocket } from '@/hooks/use-gateway-socket';

/* ═══════════════════════════════════════════════════════════════════════
 * QUANTUM MATH UTILITIES
 * ═══════════════════════════════════════════════════════════════════════ */

type Complex = [number, number];

function cMul(a: Complex, b: Complex): Complex {
  return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
}
function cConj(a: Complex): Complex {
  return [a[0], -a[1]];
}
function cAbs(a: Complex): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1]);
}
function cAdd(a: Complex, b: Complex): Complex {
  return [a[0] + b[0], a[1] + b[1]];
}
function cSub(a: Complex, b: Complex): Complex {
  return [a[0] - b[0], a[1] - b[1]];
}
function cScale(a: Complex, s: number): Complex {
  return [a[0] * s, a[1] * s];
}

/** |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩ */
function qubitState(theta: number, phi: number): [Complex, Complex] {
  const alpha: Complex = [Math.cos(theta / 2), 0];
  const beta: Complex = [
    Math.sin(theta / 2) * Math.cos(phi),
    Math.sin(theta / 2) * Math.sin(phi),
  ];
  return [alpha, beta];
}

/** Bloch vector from (theta, phi) */
function blochVector(theta: number, phi: number): [number, number, number] {
  return [
    Math.sin(theta) * Math.cos(phi),
    Math.sin(theta) * Math.sin(phi),
    Math.cos(theta),
  ];
}

/** |ψ_A⟩ ⊗ |ψ_B⟩ → 4-component state */
function tensorProduct(
  a: [Complex, Complex],
  b: [Complex, Complex],
): [Complex, Complex, Complex, Complex] {
  return [cMul(a[0], b[0]), cMul(a[0], b[1]), cMul(a[1], b[0]), cMul(a[1], b[1])];
}

/** Mix separable state toward Bell state based on correlation c ∈ [0,1] */
function applyEntanglement(
  st: [Complex, Complex, Complex, Complex],
  c: number,
): [Complex, Complex, Complex, Complex] {
  const cc = Math.max(0, Math.min(1, c));
  const norm = Math.sqrt(st.reduce((s, a) => s + a[0] * a[0] + a[1] * a[1], 0));
  const bn = norm / Math.sqrt(2);
  const result: [Complex, Complex, Complex, Complex] = [
    cAdd(cScale(st[0], 1 - cc), [cc * bn, 0]),
    cScale(st[1], 1 - cc),
    cScale(st[2], 1 - cc),
    cAdd(cScale(st[3], 1 - cc), [cc * bn, 0]),
  ];
  const n2 = Math.sqrt(result.reduce((s, a) => s + a[0] * a[0] + a[1] * a[1], 0));
  if (n2 > 1e-10) for (let i = 0; i < 4; i++) result[i] = cScale(result[i], 1 / n2);
  return result;
}

/** C = 2|α₀₀·α₁₁ − α₀₁·α₁₀| */
function concurrence(st: [Complex, Complex, Complex, Complex]): number {
  return 2 * cAbs(cSub(cMul(st[0], st[3]), cMul(st[1], st[2])));
}

/** Partial trace over qubit 1 → 2×2 reduced ρ for qubit 0 */
function partialTrace(
  st: [Complex, Complex, Complex, Complex],
): [[Complex, Complex], [Complex, Complex]] {
  const rho00: Complex = [
    st[0][0] ** 2 + st[0][1] ** 2 + st[1][0] ** 2 + st[1][1] ** 2, 0,
  ];
  const rho01 = cAdd(cMul(st[0], cConj(st[2])), cMul(st[1], cConj(st[3])));
  const rho10 = cConj(rho01);
  const rho11: Complex = [
    st[2][0] ** 2 + st[2][1] ** 2 + st[3][0] ** 2 + st[3][1] ** 2, 0,
  ];
  return [[rho00, rho01], [rho10, rho11]];
}

/** ρ = |ψ⟩⟨ψ| 4×4 */
function densityMatrix4x4(st: [Complex, Complex, Complex, Complex]): Complex[][] {
  const rho: Complex[][] = [];
  for (let i = 0; i < 4; i++) {
    rho[i] = [];
    for (let j = 0; j < 4; j++) rho[i][j] = cMul(st[i], cConj(st[j]));
  }
  return rho;
}

/** S = −Tr(ρ log₂ ρ) for 2×2 */
function vonNeumannEntropy2x2(rho: [[Complex, Complex], [Complex, Complex]]): number {
  const a = rho[0][0][0], d = rho[1][1][0];
  const offMag = cAbs(rho[0][1]);
  const disc = Math.sqrt(Math.max(0, (a - d) ** 2 + 4 * offMag ** 2));
  const lp = Math.max(1e-12, (a + d + disc) / 2);
  const lm = Math.max(1e-12, (a + d - disc) / 2);
  let S = 0;
  if (lp > 1e-12) S -= lp * Math.log2(lp);
  if (lm > 1e-12) S -= lm * Math.log2(lm);
  return Math.max(0, S);
}

/** γ = Tr(ρ²) */
function purity2x2(rho: [[Complex, Complex], [Complex, Complex]]): number {
  const a = rho[0][0][0], d = rho[1][1][0];
  const off2 = rho[0][1][0] ** 2 + rho[0][1][1] ** 2;
  return Math.min(1, a * a + d * d + 2 * off2);
}

/** Bloch vector from reduced ρ */
function blochFromRho(rho: [[Complex, Complex], [Complex, Complex]]): [number, number, number] {
  return [2 * rho[0][1][0], 2 * rho[0][1][1], rho[0][0][0] - rho[1][1][0]];
}

/* ═══════════════════════════════════════════════════════════════════════
 * TYPES & CONSTANTS
 * ═══════════════════════════════════════════════════════════════════════ */

interface QubitConfig {
  label: string;
  symbol: string;
  color: string;
}

interface QubitSnap {
  theta: number;
  phi: number;
  bloch: [number, number, number];
  alpha: Complex;
  beta: Complex;
  coherence: number;
}

interface EntLink {
  from: number;
  to: number;
  strength: number;
}

interface HypState {
  label: string;
  amplitude: number;
  probability: number;
}

interface MQState {
  qubits: QubitSnap[];
  twoQ: [Complex, Complex, Complex, Complex];
  rho4: Complex[][];
  reducedRho: [[Complex, Complex], [Complex, Complex]];
  C: number;
  subS: number;
  subP: number;
  links: EntLink[];
  hypotheses: HypState[];
}

const QUBITS: QubitConfig[] = [
  { label: 'Signal', symbol: '|ψ_S⟩', color: '#06b6d4' },
  { label: 'Motion', symbol: '|ψ_M⟩', color: '#22c55e' },
  { label: 'Environment', symbol: '|ψ_E⟩', color: '#f59e0b' },
  { label: 'Entangled', symbol: '|ψ_SE⟩', color: '#a855f7' },
];

const HYP_LABELS = [
  'Empty Station', 'Warming Up', 'Steady State', 'High Intensity',
  'Cooling Down', 'Rest Interval', 'Speed Change', 'Incline Change',
  'Multi-Person', 'Interference', 'Calibration', 'Fatigue Onset',
  'Asymmetry', 'Form Breakdown', 'Near-Fall', 'Session Complete',
];

const TRAIL_LEN = 60;
const HIST_LEN = 150;
const LERP_F = 0.08;

const SPHERE_POS: [number, number, number][] = [
  [-4.5, 0, 0], [-1.5, 0, 0], [1.5, 0, 0], [4.5, 0, 0],
];

/* ═══════════════════════════════════════════════════════════════════════
 * MULTI-QUBIT STATE HOOK
 * ═══════════════════════════════════════════════════════════════════════ */

function useMultiQubitState(metrics: {
  signalQualityScore: number;
  estimatedCadence: number;
  symmetryProxy: number;
  fatigueDriftScore: number;
  metricConfidence: number;
} | null) {
  const frameRef = useRef(0);
  const envDrift = useRef(0);
  const hypRef = useRef<HypState[]>(
    HYP_LABELS.map((l) => ({ label: l, amplitude: 0.25, probability: 1 / 16 })),
  );

  const [state, setState] = useState<MQState>(() => mkInit());
  const [cohHist, setCohHist] = useState<number[][]>([[], [], []]);
  const [entHist, setEntHist] = useState<number[]>([]);
  const [sHist, setSHist] = useState<number[]>([]);
  const [trails, setTrails] = useState<[number, number, number][][]>([[], [], [], []]);

  useEffect(() => {
    const iv = setInterval(() => {
      frameRef.current++;
      const t = frameRef.current;
      const sq = metrics?.signalQualityScore ?? 0.8;
      const cad = metrics?.estimatedCadence ?? 170;
      const sym = metrics?.symmetryProxy ?? 0.95;
      const fat = metrics?.fatigueDriftScore ?? 0;
      const conf = metrics?.metricConfidence ?? 0.85;
      const gf = cad / 60;
      const ph = t * 0.05 * gf * Math.PI * 2;

      // Q0: Signal
      const t0 = Math.acos(Math.max(-1, Math.min(1, 2 * sq - 1)));
      const p0 = ph % (2 * Math.PI);
      const [a0, b0] = qubitState(t0, p0);
      const bv0 = blochVector(t0, p0);

      // Q1: Motion
      const t1 = Math.PI / 2 + (sym - 1) * Math.PI;
      const p1 = (ph + Math.PI / 4) % (2 * Math.PI);
      const [a1, b1] = qubitState(t1, p1);
      const bv1 = blochVector(t1, p1);

      // Q2: Environment
      envDrift.current += (Math.random() - 0.5) * 0.04 - envDrift.current * 0.005;
      const t2 = Math.acos(Math.max(-1, Math.min(1, 2 * (1 - sq) - 1)));
      const p2 = (envDrift.current * Math.PI * 2 + t * 0.003) % (2 * Math.PI);
      const [a2, b2] = qubitState(t2, p2);
      const bv2 = blochVector(t2, p2);

      // Q3: Entangled pair (S⊗M)
      const sep = tensorProduct([a0, b0], [a1, b1]);
      const corr = conf * sq * (1 - fat * 0.5);
      const ent = applyEntanglement(sep, corr * 0.6);
      const C = concurrence(ent);
      const rho4 = densityMatrix4x4(ent);
      const rhoR = partialTrace(ent);
      const subS = vonNeumannEntropy2x2(rhoR);
      const subP = purity2x2(rhoR);
      const bv3 = blochFromRho(rhoR);

      const mag = (v: [number, number, number]) =>
        Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);

      const links: EntLink[] = [
        { from: 0, to: 1, strength: sq * conf * (1 - fat * 0.3) },
        { from: 0, to: 2, strength: (1 - sq) * 0.8 },
        { from: 1, to: 2, strength: (1 - sym) * 0.4 + fat * 0.3 },
      ];

      // Grover update
      const amps = hypRef.current.map((h) => h.amplitude);
      const running = cad > 140;
      if (!metrics) amps[0] *= 1.3;
      else if (running && fat > 0.4) { amps[11] *= 1.3; amps[2] *= 1.1; }
      else if (running && cad > 180) amps[3] *= 1.3;
      else if (running) amps[2] *= 1.3;
      if (sq < 0.4) amps[9] *= 1.2;
      if (sym < 0.85) amps[12] *= 1.2;
      const mean = amps.reduce((s, a) => s + a, 0) / amps.length;
      for (let i = 0; i < amps.length; i++) {
        amps[i] = Math.max(0, 2 * mean - amps[i]);
      }
      const nm = Math.sqrt(amps.reduce((s, a) => s + a * a, 0));
      if (nm > 0) for (let i = 0; i < amps.length; i++) amps[i] /= nm;
      hypRef.current = HYP_LABELS.map((l, i) => ({
        label: l, amplitude: amps[i], probability: amps[i] * amps[i],
      }));

      const qubits: QubitSnap[] = [
        { theta: t0, phi: p0, bloch: bv0, alpha: a0, beta: b0, coherence: mag(bv0) },
        { theta: t1, phi: p1, bloch: bv1, alpha: a1, beta: b1, coherence: mag(bv1) },
        { theta: t2, phi: p2, bloch: bv2, alpha: a2, beta: b2, coherence: mag(bv2) },
        {
          theta: Math.acos(Math.max(-1, Math.min(1, bv3[2]))),
          phi: Math.atan2(bv3[1], bv3[0]),
          bloch: bv3, alpha: rhoR[0][0], beta: rhoR[1][1], coherence: mag(bv3),
        },
      ];

      setState({ qubits, twoQ: ent, rho4, reducedRho: rhoR, C, subS, subP, links, hypotheses: [...hypRef.current] });

      setCohHist((prev) => prev.map((h, i) => {
        const a = [...h, qubits[i].coherence];
        return a.length > HIST_LEN ? a.slice(-HIST_LEN) : a;
      }));
      setEntHist((prev) => {
        const a = [...prev, C];
        return a.length > HIST_LEN ? a.slice(-HIST_LEN) : a;
      });
      setSHist((prev) => {
        const a = [...prev, subS];
        return a.length > HIST_LEN ? a.slice(-HIST_LEN) : a;
      });
      setTrails((prev) => prev.map((tr, i) => {
        const a = [...tr, qubits[i].bloch];
        return a.length > TRAIL_LEN ? a.slice(-TRAIL_LEN) : a;
      }));
    }, 100);
    return () => clearInterval(iv);
  }, [metrics]);

  return { state, cohHist, entHist, sHist, trails };
}

function mkInit(): MQState {
  const q: QubitSnap = { theta: 0.1, phi: 0, bloch: [0, 0, 1], alpha: [1, 0], beta: [0, 0], coherence: 1 };
  return {
    qubits: [q, q, q, q],
    twoQ: [[1, 0], [0, 0], [0, 0], [0, 0]],
    rho4: Array.from({ length: 4 }, (_, i) =>
      Array.from({ length: 4 }, (_, j) => (i === 0 && j === 0 ? [1, 0] : [0, 0]) as Complex)),
    reducedRho: [[[1, 0], [0, 0]], [[0, 0], [0, 0]]],
    C: 0, subS: 0, subP: 1, links: [],
    hypotheses: HYP_LABELS.map((l) => ({ label: l, amplitude: 0.25, probability: 1 / 16 })),
  };
}

/* ═══════════════════════════════════════════════════════════════════════
 * 3D — SINGLE BLOCH SPHERE
 * ═══════════════════════════════════════════════════════════════════════ */

function SphereWireframe({ color }: { color: string }) {
  return (
    <>
      <mesh>
        <sphereGeometry args={[1, 32, 32]} />
        <meshStandardMaterial color={color} transparent opacity={0.04} side={THREE.DoubleSide} />
      </mesh>
      <mesh>
        <sphereGeometry args={[1, 20, 20]} />
        <meshStandardMaterial color={color} transparent opacity={0.12} wireframe />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.98, 1.02, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} side={THREE.DoubleSide} />
      </mesh>
    </>
  );
}

function SphereAxes() {
  const L = 1.25;
  return (
    <group>
      <Line points={[[-L, 0, 0], [L, 0, 0]]} color="#64748b" lineWidth={0.8} opacity={0.3} transparent />
      <Line points={[[0, -L, 0], [0, L, 0]]} color="#64748b" lineWidth={0.8} opacity={0.3} transparent />
      <Line points={[[0, 0, -L], [0, 0, L]]} color="#64748b" lineWidth={0.8} opacity={0.3} transparent />
      <Html position={[0, 0, L + 0.12]} center><span className="text-[9px] font-mono text-blue-400/80">|0⟩</span></Html>
      <Html position={[0, 0, -L - 0.12]} center><span className="text-[9px] font-mono text-blue-400/80">|1⟩</span></Html>
      <Html position={[L + 0.12, 0, 0]} center><span className="text-[9px] font-mono text-slate-500">+</span></Html>
      <Html position={[-L - 0.12, 0, 0]} center><span className="text-[9px] font-mono text-slate-500">−</span></Html>
      <Html position={[0, L + 0.12, 0]} center><span className="text-[9px] font-mono text-slate-500">+i</span></Html>
      <Html position={[0, -L - 0.12, 0]} center><span className="text-[9px] font-mono text-slate-500">−i</span></Html>
    </group>
  );
}

function StateArrow({ bloch, trail, color }: {
  bloch: [number, number, number];
  trail: [number, number, number][];
  color: string;
}) {
  const target = useRef(new THREE.Vector3(bloch[0], bloch[2], bloch[1]));
  const current = useRef(new THREE.Vector3(bloch[0], bloch[2], bloch[1]));
  const tipRef = useRef<THREE.Mesh>(null);

  useEffect(() => { target.current.set(bloch[0], bloch[2], bloch[1]); }, [bloch]);

  useFrame(() => {
    current.current.lerp(target.current, LERP_F);
    if (tipRef.current) tipRef.current.position.copy(current.current);
  });

  const pts = useMemo(
    () => trail.length > 2 ? trail.map(([x, y, z]) => [x, z, y] as [number, number, number]) : null,
    [trail],
  );

  return (
    <group>
      <Line
        points={[[0, 0, 0], [current.current.x, current.current.y, current.current.z]]}
        color={color} lineWidth={2.5} opacity={0.9} transparent
      />
      <mesh ref={tipRef}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} />
      </mesh>
      {pts && <Line points={pts} color={color} lineWidth={1} opacity={0.25} transparent />}
    </group>
  );
}

function EntanglementHalo({ cVal, color }: { cVal: number; color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) { ref.current.rotation.z += dt * 0.5; ref.current.rotation.x += dt * 0.2; }
  });
  return (
    <mesh ref={ref}>
      <torusGeometry args={[1.15, 0.02 + cVal * 0.08, 16, 64]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={cVal * 2} transparent opacity={0.3 + cVal * 0.5} />
    </mesh>
  );
}

function SingleBloch({ q, trail, cfg, halo, cVal }: {
  q: QubitSnap; trail: [number, number, number][]; cfg: QubitConfig; halo?: boolean; cVal?: number;
}) {
  return (
    <group>
      <SphereWireframe color={cfg.color} />
      <SphereAxes />
      <StateArrow bloch={q.bloch} trail={trail} color={cfg.color} />
      {halo && cVal !== undefined && <EntanglementHalo cVal={cVal} color="#ec4899" />}
      <Html position={[0, -1.55, 0]} center>
        <div className="text-center whitespace-nowrap">
          <div className="text-[10px] font-bold" style={{ color: cfg.color }}>{cfg.label}</div>
          <div className="font-mono text-[8px] text-slate-400">{cfg.symbol}</div>
        </div>
      </Html>
    </group>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * 3D — MULTI-QUBIT SCENE
 * ═══════════════════════════════════════════════════════════════════════ */

function EntLine3D({ from, to, strength }: { from: [number, number, number]; to: [number, number, number]; strength: number }) {
  return (
    <Line
      points={[from, to]}
      color="#ec4899"
      lineWidth={0.5 + strength * 3}
      opacity={Math.max(0.05, Math.min(0.8, strength))}
      transparent dashed dashSize={0.15} gapSize={0.1}
    />
  );
}

function MultiQubitScene({ mq, trails }: { mq: MQState; trails: [number, number, number][][] }) {
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[8, 8, 8]} intensity={0.5} />
      <pointLight position={[-6, 4, 4]} intensity={0.3} color="#06b6d4" />
      <pointLight position={[6, 4, -4]} intensity={0.2} color="#a855f7" />
      {mq.qubits.map((q, i) => (
        <group key={i} position={SPHERE_POS[i]}>
          <SingleBloch q={q} trail={trails[i] ?? []} cfg={QUBITS[i]} halo={i === 3} cVal={i === 3 ? mq.C : undefined} />
        </group>
      ))}
      {mq.links.map((lk, i) => (
        <EntLine3D key={i} from={SPHERE_POS[lk.from]} to={SPHERE_POS[lk.to]} strength={lk.strength} />
      ))}
      <OrbitControls enablePan={false} minDistance={6} maxDistance={18} autoRotate autoRotateSpeed={0.3} target={[0, 0, 0]} />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * 2D — STATE VECTOR DISPLAY
 * ═══════════════════════════════════════════════════════════════════════ */

function StateVectorDisplay({ sv }: { sv: [Complex, Complex, Complex, Complex] }) {
  const basis = ['00', '01', '10', '11'];
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-slate-400">Two-Qubit State Vector |ψ⟩</div>
      <div className="flex flex-wrap items-center gap-1 font-mono text-xs">
        <span className="text-slate-300">|ψ⟩ =</span>
        {sv.map((amp, i) => {
          const m = cAbs(amp);
          const p = Math.atan2(amp[1], amp[0]);
          return (
            <span key={i} className="inline-flex items-center">
              {i > 0 && <span className="mx-0.5 text-slate-500">+</span>}
              <span className="rounded px-1.5 py-0.5" style={{
                backgroundColor: `rgba(168,85,247,${m * 0.4})`,
                color: m > 0.1 ? '#e2e8f0' : '#64748b',
              }}>
                {m.toFixed(3)}
                {Math.abs(p) > 0.01 && <span className="text-[9px] text-purple-300">e<sup>i{p.toFixed(1)}</sup></span>}
              </span>
              <span className="text-purple-400">|{basis[i]}⟩</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * 2D — DENSITY MATRIX HEATMAP
 * ═══════════════════════════════════════════════════════════════════════ */

function DensityMatrixHeatmap({ rho }: { rho: Complex[][] }) {
  const basis = ['|00⟩', '|01⟩', '|10⟩', '|11⟩'];
  const maxM = Math.max(...rho.flat().map(cAbs), 0.01);
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-slate-400">4×4 Density Matrix ρ = |ψ⟩⟨ψ|</div>
      <div className="flex items-start gap-1">
        <div className="flex flex-col gap-0.5 pt-5">
          {basis.map((l) => <div key={l} className="flex h-9 items-center font-mono text-[8px] text-slate-500">{l}</div>)}
        </div>
        <div>
          <div className="flex gap-0.5 mb-0.5">
            {basis.map((l) => <div key={l} className="w-9 text-center font-mono text-[8px] text-slate-500">{l}</div>)}
          </div>
          <div className="grid grid-cols-4 gap-0.5">
            {rho.map((row, i) => row.map((cell, j) => {
              const m = cAbs(cell);
              const r = m / maxM;
              const diag = i === j;
              return (
                <div key={`${i}-${j}`}
                  className="flex h-9 w-9 items-center justify-center rounded text-[8px] font-mono transition-all duration-300"
                  style={{
                    backgroundColor: diag ? `rgba(168,85,247,${r * 0.6})` : `rgba(236,72,153,${r * 0.5})`,
                    color: r > 0.2 ? '#e2e8f0' : '#475569',
                    boxShadow: r > 0.3 ? `0 0 8px ${diag ? 'rgba(168,85,247,0.3)' : 'rgba(236,72,153,0.3)'}` : 'none',
                  }}
                  title={`ρ[${i}][${j}] = ${cell[0].toFixed(3)} + ${cell[1].toFixed(3)}i`}
                >{m.toFixed(2)}</div>
              );
            }))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * 2D — ENTANGLEMENT MEASURES
 * ═══════════════════════════════════════════════════════════════════════ */

function EntanglementMeasures({ C, S, P }: { C: number; S: number; P: number }) {
  const items = [
    { label: 'Concurrence', value: C, color: '#ec4899', desc: '2|α₀₀α₁₁ − α₀₁α₁₀|' },
    { label: 'Subsystem Entropy', value: S, color: '#f59e0b', desc: 'S = −Tr(ρ_S log₂ ρ_S)' },
    { label: 'Purity', value: P, color: '#a855f7', desc: 'γ = Tr(ρ²)' },
  ];
  return (
    <div className="space-y-3">
      <div className="text-xs font-medium text-slate-400">Entanglement Measures</div>
      {items.map((m) => {
        const pct = Math.min(1, m.value) * 100;
        return (
          <div key={m.label} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-slate-300">{m.label}</span>
              <span className="font-mono text-xs font-bold" style={{ color: m.color }}>{m.value.toFixed(4)}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, backgroundColor: m.color, boxShadow: `0 0 8px ${m.color}40` }} />
            </div>
            <div className="text-[9px] font-mono text-slate-500">{m.desc}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * 2D — QUANTUM CIRCUIT DIAGRAM
 * ═══════════════════════════════════════════════════════════════════════ */

function QuantumCircuit() {
  const [active, setActive] = useState(0);
  useEffect(() => { const iv = setInterval(() => setActive((p) => (p + 1) % 7), 700); return () => clearInterval(iv); }, []);

  const gates = [
    { label: 'H', q: 0, x: 55 },
    { label: 'Rᵧ', q: 0, x: 105 },
    { label: 'Rᵧ', q: 1, x: 155 },
    { label: 'CX', q: 0, x: 205, tgt: 1 },
    { label: 'Rᵤ', q: 1, x: 255 },
    { label: 'Rz', q: 0, x: 305 },
    { label: 'M', q: 0, x: 355 },
  ];

  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-slate-400">Quantum Sensing Circuit</div>
      <svg viewBox="0 0 420 90" className="w-full">
        {[0, 1].map((q) => (
          <g key={q}>
            <text x={8} y={28 + q * 35} fill="#94a3b8" style={{ fontSize: '10px', fontFamily: 'monospace' }}>|q{q}⟩</text>
            <line x1={35} y1={25 + q * 35} x2={410} y2={25 + q * 35} stroke="#334155" strokeWidth={1.5} />
          </g>
        ))}
        {gates.map((g, i) => {
          const y = 15 + g.q * 35;
          const on = i === active;
          return (
            <g key={i}>
              <rect x={g.x} y={y} width={30} height={20} rx={4}
                fill={on ? '#7c3aed' : '#0f172a'} stroke={on ? '#a78bfa' : '#475569'}
                strokeWidth={on ? 2 : 1}
                style={{ filter: on ? 'drop-shadow(0 0 8px #7c3aed)' : 'none', transition: 'all 0.3s' }} />
              <text x={g.x + 15} y={y + 14} textAnchor="middle"
                fill={on ? '#fff' : '#94a3b8'}
                style={{ fontSize: '10px', fontWeight: 'bold', fontFamily: 'monospace' }}>{g.label}</text>
              {g.tgt !== undefined && (
                <>
                  <line x1={g.x + 15} y1={y + 20} x2={g.x + 15} y2={15 + g.tgt * 35} stroke={on ? '#a78bfa' : '#475569'} strokeWidth={1.5} />
                  <circle cx={g.x + 15} cy={15 + g.tgt * 35 + 10} r={6} fill="none" stroke={on ? '#a78bfa' : '#475569'} strokeWidth={1.5} />
                  <line x1={g.x + 11} y1={15 + g.tgt * 35 + 10} x2={g.x + 19} y2={15 + g.tgt * 35 + 10} stroke={on ? '#a78bfa' : '#475569'} strokeWidth={1.5} />
                  <line x1={g.x + 15} y1={15 + g.tgt * 35 + 6} x2={g.x + 15} y2={15 + g.tgt * 35 + 14} stroke={on ? '#a78bfa' : '#475569'} strokeWidth={1.5} />
                </>
              )}
              {g.label === 'M' && (
                <path d={`M ${g.x + 8} ${y + 16} Q ${g.x + 15} ${y + 4} ${g.x + 22} ${y + 16}`}
                  fill="none" stroke={on ? '#fff' : '#94a3b8'} strokeWidth={1} />
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-pulse" />
        <span className="text-[9px] text-slate-500">H → Rᵧ(θ_signal) → Rᵧ(θ_motion) → CNOT → Rz(φ) → M</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * 2D — WAVEFORM
 * ═══════════════════════════════════════════════════════════════════════ */

function MultiWaveform({ channels, colors, labels, title, maxVal = 1, height = 130 }: {
  channels: number[][]; colors: string[]; labels: string[]; title: string; maxVal?: number; height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cvs = canvasRef.current;
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const rect = cvs.getBoundingClientRect();
    cvs.width = rect.width * dpr;
    cvs.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(100,116,139,0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const y = (i / 4) * h; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    channels.forEach((data, ci) => {
      if (data.length < 2) return;
      const col = colors[ci] ?? '#fff';
      ctx.shadowBlur = 6; ctx.shadowColor = col;
      ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.beginPath();
      data.forEach((val, i) => {
        const x = (i / (data.length - 1)) * w;
        const y = h - (Math.min(val, maxVal) / maxVal) * h * 0.85 - h * 0.075;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke(); ctx.shadowBlur = 0;
    });
  }, [channels, colors, maxVal, height]);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{title}</span>
        <div className="flex items-center gap-3">
          {labels.map((l, i) => (
            <div key={l} className="flex items-center gap-1">
              <div className="h-1.5 w-3 rounded-full" style={{ backgroundColor: colors[i] }} />
              <span className="text-[9px] text-slate-500">{l}</span>
            </div>
          ))}
        </div>
      </div>
      <canvas ref={canvasRef} height={height} className="w-full rounded-lg bg-slate-950/50" style={{ height }} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * 2D — GROVER HYPOTHESIS SEARCH
 * ═══════════════════════════════════════════════════════════════════════ */

function HypothesisSearch({ hypotheses }: { hypotheses: HypState[] }) {
  const sorted = useMemo(() => [...hypotheses].sort((a, b) => b.probability - a.probability), [hypotheses]);
  const maxP = Math.max(...sorted.map((h) => h.probability), 0.01);
  const winner = sorted[0];
  const converged = winner && winner.probability > 0.4;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">Grover-Inspired Hypothesis Search (16 states)</span>
        <Badge variant={converged ? 'success' : 'warning'}
          className={converged ? 'bg-green-500/20 text-green-300' : 'bg-amber-500/20 text-amber-300'}>
          {converged ? `→ ${winner.label}` : 'Searching…'}
        </Badge>
      </div>
      <div className="space-y-1">
        {sorted.slice(0, 8).map((h) => {
          const pct = (h.probability / maxP) * 100;
          const win = h === winner && converged;
          return (
            <div key={h.label} className="flex items-center gap-2">
              <span className="w-24 truncate text-[9px] text-slate-500">{h.label}</span>
              <div className="flex-1 h-2.5 rounded-full bg-slate-800/80 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    background: win ? 'linear-gradient(90deg,#a855f7,#ec4899)' : 'linear-gradient(90deg,#334155,#475569)',
                    boxShadow: win ? '0 0 8px rgba(168,85,247,0.4)' : 'none',
                  }} />
              </div>
              <span className="w-12 text-right font-mono text-[9px] text-slate-400">{(h.probability * 100).toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
      <div className="text-[9px] text-slate-600">Amplitude amplification via oracle + diffusion. Signal×Motion 2-qubit state drives search space.</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * 2D — QUBIT COEFFICIENT CARDS
 * ═══════════════════════════════════════════════════════════════════════ */

function QubitCards({ qubits }: { qubits: QubitSnap[] }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {qubits.map((q, i) => {
        const cfg = QUBITS[i];
        return (
          <div key={cfg.label} className="rounded-lg border border-slate-700/50 bg-slate-900/60 p-2.5"
            style={{ borderColor: `${cfg.color}20` }}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
              <span className="font-mono text-[9px] text-slate-500">{cfg.symbol}</span>
            </div>
            <div className="font-mono text-[10px] text-slate-300">
              {cAbs(q.alpha).toFixed(3)}|0⟩ + {cAbs(q.beta).toFixed(3)}|1⟩
            </div>
            <div className="mt-1 text-[8px] text-slate-600">
              B({q.bloch[0].toFixed(2)}, {q.bloch[1].toFixed(2)}, {q.bloch[2].toFixed(2)})
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * 2D — CIRCULAR GAUGE
 * ═══════════════════════════════════════════════════════════════════════ */

function Gauge({ value, label, color, max = 1 }: { value: number; label: string; color: string; max?: number }) {
  const pct = Math.min(value / max, 1);
  const R = 32, C = 2 * Math.PI * R, off = C * (1 - pct);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width={78} height={78} viewBox="0 0 78 78">
        <circle cx={39} cy={39} r={R} fill="none" stroke="rgba(51,65,85,0.4)" strokeWidth={5} />
        <circle cx={39} cy={39} r={R} fill="none" stroke={color} strokeWidth={5}
          strokeDasharray={C} strokeDashoffset={off} strokeLinecap="round"
          transform="rotate(-90 39 39)"
          style={{ transition: 'stroke-dashoffset 0.5s ease', filter: `drop-shadow(0 0 4px ${color})` }} />
        <text x={39} y={36} textAnchor="middle" fill="#e2e8f0"
          style={{ fontSize: '14px', fontFamily: 'monospace', fontWeight: 'bold' }}>{value.toFixed(3)}</text>
        <text x={39} y={50} textAnchor="middle" fill="#64748b" style={{ fontSize: '7px' }}>/ {max}</text>
      </svg>
      <span className="text-[9px] font-medium text-slate-500">{label}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
 * PAGE
 * ═══════════════════════════════════════════════════════════════════════ */

export default function QuantumObservatoryPage() {
  const { connected, demoMode, metrics } = useGatewaySocket();
  const { state, cohHist, entHist, sHist, trails } = useMultiQubitState(metrics);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">
            <span className="text-violet-400">⚛</span> Quantum Observatory
          </h1>
          <p className="mt-0.5 text-sm text-slate-400">Multi-qubit quantum-inspired visualization of Wi-Fi CSI sensing</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={connected ? 'success' : 'danger'}
            className={connected ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}>
            {connected ? 'Live' : 'Offline'}
          </Badge>
          {demoMode && <Badge variant="warning" className="bg-amber-500/20 text-amber-300">Demo</Badge>}
          <Badge variant="info" className="bg-violet-500/20 text-violet-300">Experimental</Badge>
          <Badge variant="outline" className="border-slate-600 text-slate-400">Quantum-Inspired</Badge>
        </div>
      </div>

      {/* § 1 — Multi-Qubit Bloch Sphere Array */}
      <Card className="relative overflow-hidden border-violet-500/20 bg-slate-900/80 backdrop-blur">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-100">Multi-Qubit Bloch Sphere Array</CardTitle>
            <div className="flex items-center gap-3">
              {QUBITS.map((c) => (
                <div key={c.label} className="flex items-center gap-1">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="text-[9px] text-slate-500">{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        </CardHeader>
        <div className="h-[320px] sm:h-[380px] -mx-2 -mb-2">
          <Canvas camera={{ position: [0, 3, 12], fov: 42 }} style={{ background: 'transparent' }}>
            <MultiQubitScene mq={state} trails={trails} />
          </Canvas>
        </div>
        <div className="absolute bottom-3 left-4 flex gap-2">
          <div className="rounded-lg bg-slate-950/80 backdrop-blur px-3 py-1.5">
            <div className="text-[9px] text-slate-500">Concurrence</div>
            <div className="font-mono text-sm font-bold"
              style={{ color: state.C > 0.5 ? '#ec4899' : state.C > 0.2 ? '#f59e0b' : '#64748b' }}>
              {state.C.toFixed(4)}
            </div>
          </div>
          <div className="rounded-lg bg-slate-950/80 backdrop-blur px-3 py-1.5">
            <div className="text-[9px] text-slate-500">Subsystem S</div>
            <div className="font-mono text-sm font-bold text-amber-400">{state.subS.toFixed(4)}</div>
          </div>
          <div className="rounded-lg bg-slate-950/80 backdrop-blur px-3 py-1.5">
            <div className="text-[9px] text-slate-500">Purity Tr(ρ²)</div>
            <div className="font-mono text-sm font-bold text-purple-400">{state.subP.toFixed(4)}</div>
          </div>
        </div>
        <div className="absolute bottom-3 right-4">
          <span className="text-[9px] text-slate-600">Drag to rotate · Scroll to zoom</span>
        </div>
      </Card>

      {/* § 2 — Qubit Coefficient Cards */}
      <QubitCards qubits={state.qubits} />

      {/* § 3 — Quantum State Panel */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-violet-500/20 bg-slate-900/80 backdrop-blur">
          <CardHeader><CardTitle className="text-slate-100 text-sm">Two-Qubit Quantum State</CardTitle></CardHeader>
          <div className="space-y-5">
            <StateVectorDisplay sv={state.twoQ} />
            <DensityMatrixHeatmap rho={state.rho4} />
          </div>
        </Card>
        <div className="space-y-4">
          <Card className="border-violet-500/20 bg-slate-900/80 backdrop-blur">
            <CardHeader><CardTitle className="text-slate-100 text-sm">Entanglement</CardTitle></CardHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-around">
                <Gauge value={state.C} label="Concurrence" color="#ec4899" />
                <Gauge value={state.subS} label="Entropy S" color="#f59e0b" />
                <Gauge value={state.subP} label="Purity γ" color="#a855f7" />
              </div>
              <EntanglementMeasures C={state.C} S={state.subS} P={state.subP} />
            </div>
          </Card>
          <Card className="border-violet-500/20 bg-slate-900/80 backdrop-blur">
            <CardHeader><CardTitle className="text-slate-100 text-sm">Sensing Pipeline Circuit</CardTitle></CardHeader>
            <QuantumCircuit />
          </Card>
        </div>
      </div>

      {/* § 4 — Waveforms */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-violet-500/20 bg-slate-900/80 backdrop-blur">
          <CardHeader><CardTitle className="text-slate-100 text-sm">Coherence Oscillation</CardTitle></CardHeader>
          <MultiWaveform channels={cohHist} colors={['#06b6d4', '#22c55e', '#f59e0b']}
            labels={['Signal', 'Motion', 'Environment']} title="Qubit Coherence |⟨B⟩|" maxVal={1.2} />
          <p className="mt-2 text-[9px] text-slate-600">Coherence = Bloch vector magnitude. Oscillation aligned to estimated gait cycle.</p>
        </Card>
        <Card className="border-violet-500/20 bg-slate-900/80 backdrop-blur">
          <CardHeader><CardTitle className="text-slate-100 text-sm">Entanglement Dynamics</CardTitle></CardHeader>
          <MultiWaveform channels={[entHist, sHist]} colors={['#ec4899', '#f59e0b']}
            labels={['Concurrence', 'Subsystem S']} title="Entangled Pair (Signal ⊗ Motion)" maxVal={1.2} />
          <p className="mt-2 text-[9px] text-slate-600">Rising entropy indicates decoherence from environmental interference.</p>
        </Card>
      </div>

      {/* § 5 — Hypothesis Search + How It Works */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-violet-500/20 bg-slate-900/80 backdrop-blur">
          <CardHeader><CardTitle className="text-slate-100 text-sm">Quantum State Classification — Grover Search</CardTitle></CardHeader>
          <HypothesisSearch hypotheses={state.hypotheses} />
        </Card>
        <Card className="border-violet-500/20 bg-slate-900/80 backdrop-blur">
          <CardHeader><CardTitle className="text-slate-100 text-sm">How It Works</CardTitle></CardHeader>
          <div className="space-y-2.5 text-[10px] text-slate-400">
            {[
              { n: '1', c: '#06b6d4', t: <>CSI subcarrier phases → <strong className="text-cyan-400">Bloch sphere</strong> point. Mean vector = signal qubit.</> },
              { n: '2', c: '#22c55e', t: <>Gait symmetry + cadence → <strong className="text-green-400">motion qubit</strong>. Equator = symmetric.</> },
              { n: '3', c: '#f59e0b', t: <>Environmental noise → <strong className="text-amber-400">environment qubit</strong>. Anti-correlated with signal.</> },
              { n: '4', c: '#a855f7', t: <>Signal ⊗ Motion → <strong className="text-purple-400">entangled pair</strong>. Concurrence measures correlation.</> },
              { n: '5', c: '#ec4899', t: <><strong className="text-pink-400">Grover search</strong> classifies runner state from 2-qubit amplitudes.</> },
            ].map((s) => (
              <div key={s.n} className="flex gap-2">
                <div className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-[9px] font-bold"
                  style={{ backgroundColor: `${s.c}20`, color: s.c }}>{s.n}</div>
                <p>{s.t}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Disclaimers */}
      <div className="space-y-2">
        <div className="rounded-xl border border-violet-500/15 bg-violet-950/20 p-3">
          <p className="text-[10px] text-violet-300/80">
            <strong>Quantum-inspired visualization</strong> — This visualization maps classical Wi-Fi CSI signals
            onto quantum-inspired mathematical representations. It does not involve actual quantum hardware or
            true quantum computation. All quantum metrics carry <em>experimental</em> validation status.
          </p>
        </div>
        <div className="rounded-xl border border-amber-500/15 bg-amber-950/20 p-3">
          <p className="text-[10px] text-amber-300/80">
            <strong>Scientific transparency:</strong> The Bloch sphere formalism provides mathematically precise
            signal quality assessment, but all biomechanics proxy metrics require external validation (force plates,
            optical motion capture) before clinical use. Concurrence, entropy, and purity are derived from classical
            correlations mapped into quantum notation — not from quantum entanglement.
          </p>
        </div>
      </div>
    </div>
  );
}
