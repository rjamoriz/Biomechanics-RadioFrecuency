/** Simulated athlete profile for demo mode */
export interface AthleteSimProfile {
  name: string;
  restingCadenceSpm: number;
  maxCadenceSpm: number;
  asymmetryBaseline: number;
  contactTimeBaseMs: number;
  flightTimeBaseMs: number;
  restingBreathingBpm: number;
  restingHeartRateBpm: number;
  fatigueResistance: number; // 0..1, 1 = very fatigue resistant
  heightCm: number;
  weightKg: number;
}

/** Current state of the demo simulation */
export interface SimulationState {
  profile: AthleteSimProfile;
  elapsedSeconds: number;
  currentGaitFreqHz: number;
  currentCadenceSpm: number;
  currentBreathingBpm: number;
  currentHeartRateBpm: number;
  fatigueLevel: number; // 0..1
  signalNoiseLevel: SignalNoiseLevel;
  packetsGenerated: number;
  treadmillSpeedKmh: number;
  treadmillInclinePercent: number;
  isRunning: boolean;
  heightCm: number;
  weightKg: number;
}

export type SignalNoiseLevel = 'clean' | 'moderate' | 'noisy';

/** Predefined treadmill protocol for demo */
export interface DemoProtocol {
  name: string;
  description: string;
  stages: DemoProtocolStage[];
}

export interface DemoProtocolStage {
  label: string;
  durationSeconds: number;
  speedKph: number;
  inclinePercent: number;
}

/** Preset athlete profiles */
export const ATHLETE_PROFILES: Record<string, AthleteSimProfile> = {
  'elite-runner': {
    name: 'elite-runner',
    restingCadenceSpm: 170,
    maxCadenceSpm: 210,
    asymmetryBaseline: 0.01,
    contactTimeBaseMs: 200,
    flightTimeBaseMs: 130,
    restingBreathingBpm: 12,
    restingHeartRateBpm: 55,
    fatigueResistance: 0.85,
    heightCm: 178,
    weightKg: 68,
  },
  recreational: {
    name: 'recreational',
    restingCadenceSpm: 160,
    maxCadenceSpm: 195,
    asymmetryBaseline: 0.03,
    contactTimeBaseMs: 260,
    flightTimeBaseMs: 90,
    restingBreathingBpm: 15,
    restingHeartRateBpm: 68,
    fatigueResistance: 0.55,
    heightCm: 175,
    weightKg: 78,
  },
  'rehab-patient': {
    name: 'rehab-patient',
    restingCadenceSpm: 150,
    maxCadenceSpm: 175,
    asymmetryBaseline: 0.08,
    contactTimeBaseMs: 310,
    flightTimeBaseMs: 60,
    restingBreathingBpm: 18,
    restingHeartRateBpm: 78,
    fatigueResistance: 0.3,
    heightCm: 170,
    weightKg: 85,
  },
};

/** Predefined protocols */
export const DEMO_PROTOCOLS: Record<string, DemoProtocol> = {
  'progressive-5k': {
    name: 'progressive-5k',
    description: '5 progressive stages from 6 to 14 km/h, 5 min each, 0% incline',
    stages: [
      { label: 'Warm-up 6 km/h', durationSeconds: 300, speedKph: 6, inclinePercent: 0 },
      { label: 'Easy 8 km/h', durationSeconds: 300, speedKph: 8, inclinePercent: 0 },
      { label: 'Moderate 10 km/h', durationSeconds: 300, speedKph: 10, inclinePercent: 0 },
      { label: 'Tempo 12 km/h', durationSeconds: 300, speedKph: 12, inclinePercent: 0 },
      { label: 'Fast 14 km/h', durationSeconds: 300, speedKph: 14, inclinePercent: 0 },
    ],
  },
  'vo2max-ramp': {
    name: 'vo2max-ramp',
    description: '8 stages starting at 8 km/h, +1 km/h every 2 min, 1% incline',
    stages: Array.from({ length: 8 }, (_, i) => ({
      label: `Stage ${i + 1}: ${8 + i} km/h`,
      durationSeconds: 120,
      speedKph: 8 + i,
      inclinePercent: 1,
    })),
  },
  'interval-training': {
    name: 'interval-training',
    description: '8 stages alternating 12 km/h (2 min) / 6 km/h (1 min)',
    stages: Array.from({ length: 8 }, (_, i) => {
      const isWork = i % 2 === 0;
      return {
        label: isWork ? `Work ${i / 2 + 1}` : `Recovery ${Math.ceil(i / 2)}`,
        durationSeconds: isWork ? 120 : 60,
        speedKph: isWork ? 12 : 6,
        inclinePercent: 0,
      };
    }),
  },
};
