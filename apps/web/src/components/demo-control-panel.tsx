'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, RotateCcw, Play, Settings2 } from 'lucide-react';
import type { SimulationState, DemoControlAction } from '@/hooks/use-gateway-socket';

const PROFILES = ['elite-runner', 'recreational', 'rehab-patient'] as const;
const PROTOCOLS = ['progressive-5k', 'vo2max-ramp', 'interval-training'] as const;
const NOISE_LEVELS = ['clean', 'moderate', 'noisy'] as const;

interface DemoControlPanelProps {
  demoState: SimulationState | null;
  onDemoControl: (action: DemoControlAction, payload?: Record<string, unknown>) => void;
  onSetTreadmill: (speedKph: number, inclinePercent: number) => void;
}

export function DemoControlPanel({
  demoState,
  onDemoControl,
  onSetTreadmill,
}: DemoControlPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [speed, setSpeed] = useState(8);
  const [incline, setIncline] = useState(0);
  const [fatigueRate, setFatigueRate] = useState(50);
  const [height, setHeight] = useState(175);
  const [weight, setWeight] = useState(78);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-amber-600" />
            <CardTitle className="text-sm font-medium text-amber-900">
              Demo Simulator Controls
            </CardTitle>
            <Badge variant="warning">Synthetic Data</Badge>
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="rounded p-1 hover:bg-amber-100"
            aria-label={collapsed ? 'Expand demo controls' : 'Collapse demo controls'}
          >
            {collapsed ? (
              <ChevronDown className="h-4 w-4 text-amber-600" />
            ) : (
              <ChevronUp className="h-4 w-4 text-amber-600" />
            )}
          </button>
        </div>
        {!collapsed && (
          <p className="text-xs text-amber-600">
            All data is synthetically generated — not from real sensors.
          </p>
        )}
      </CardHeader>

      {!collapsed && (
        <div className="space-y-4 px-6 pb-4">
          {/* Row 1: Profile + Protocol */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Profile selector */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Athlete Profile
              </label>
              <select
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
                value={demoState?.profile?.name ?? 'recreational'}
                onChange={(e) =>
                  onDemoControl('set-profile', { name: e.target.value })
                }
              >
                {PROFILES.map((p) => (
                  <option key={p} value={p}>
                    {p.replace('-', ' ')}
                  </option>
                ))}
              </select>
            </div>

            {/* Protocol selector */}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Protocol
              </label>
              <div className="flex gap-2">
                <select
                  id="demo-protocol"
                  className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
                  defaultValue="progressive-5k"
                >
                  {PROTOCOLS.map((p) => (
                    <option key={p} value={p}>
                      {p.replace(/-/g, ' ')}
                    </option>
                  ))}
                </select>
                <button
                  className="flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                  onClick={() => {
                    const select = document.getElementById(
                      'demo-protocol',
                    ) as HTMLSelectElement;
                    onDemoControl('start-protocol', { name: select.value });
                  }}
                >
                  <Play className="h-3 w-3" /> Start
                </button>
              </div>
            </div>
          </div>

          {/* Row 2: Manual speed/incline */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-700">
                <span>Speed</span>
                <span className="text-slate-500">{speed} km/h</span>
              </label>
              <input
                type="range"
                min={0}
                max={22}
                step={0.5}
                value={speed}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setSpeed(v);
                  onSetTreadmill(v, incline);
                }}
                className="w-full accent-amber-600"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-700">
                <span>Incline</span>
                <span className="text-slate-500">{incline}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={15}
                step={0.5}
                value={incline}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setIncline(v);
                  onSetTreadmill(speed, v);
                }}
                className="w-full accent-amber-600"
              />
            </div>
          </div>

          {/* Row 2b: Runner anthropometrics (height / weight) */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-700">
                <span>Height</span>
                <span className="text-slate-500">{height} cm</span>
              </label>
              <input
                type="range"
                min={150}
                max={210}
                step={1}
                value={height}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setHeight(v);
                  onDemoControl('set-anthropometrics', {
                    heightCm: v,
                    weightKg: weight,
                  });
                }}
                className="w-full accent-amber-600"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-700">
                <span>Weight</span>
                <span className="text-slate-500">{weight} kg</span>
              </label>
              <input
                type="range"
                min={40}
                max={130}
                step={1}
                value={weight}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setWeight(v);
                  onDemoControl('set-anthropometrics', {
                    heightCm: height,
                    weightKg: v,
                  });
                }}
                className="w-full accent-amber-600"
              />
            </div>
          </div>

          {/* Row 3: Fatigue + Noise + Reset */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 flex items-center justify-between text-xs font-medium text-slate-700">
                <span>Fatigue Rate</span>
                <span className="text-slate-500">{fatigueRate}%</span>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={fatigueRate}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setFatigueRate(v);
                  onDemoControl('set-fatigue', { rate: v / 100 });
                }}
                className="w-full accent-amber-600"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Signal Noise
              </label>
              <select
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900"
                value={demoState?.signalNoiseLevel ?? 'clean'}
                onChange={(e) =>
                  onDemoControl('set-noise', { level: e.target.value })
                }
              >
                {NOISE_LEVELS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => {
                  onDemoControl('reset');
                  setSpeed(8);
                  setIncline(0);
                  setFatigueRate(50);
                  setHeight(175);
                  setWeight(78);
                }}
                className="flex w-full items-center justify-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            </div>
          </div>

          {/* Simulation state readout */}
          {demoState && (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-white/70 p-3 text-xs sm:grid-cols-4">
              <StatReadout label="Elapsed" value={formatTime(demoState.elapsedSeconds)} />
              <StatReadout label="Cadence" value={`${demoState.currentCadenceSpm} SPM`} />
              <StatReadout
                label="Gait Freq"
                value={`${demoState.currentGaitFreqHz} Hz`}
              />
              <StatReadout
                label="Fatigue"
                value={`${(demoState.fatigueLevel * 100).toFixed(1)}%`}
              />
              <StatReadout
                label="Breathing"
                value={`${demoState.currentBreathingBpm} BPM`}
              />
              <StatReadout
                label="Heart Rate"
                value={`${demoState.currentHeartRateBpm} BPM`}
              />
              <StatReadout
                label="Speed"
                value={`${demoState.treadmillSpeedKmh} km/h`}
              />
              <StatReadout
                label="Packets"
                value={demoState.packetsGenerated.toLocaleString()}
              />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function StatReadout({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-400">{label}: </span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  );
}
