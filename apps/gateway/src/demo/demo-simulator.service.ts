import { Injectable, Logger } from '@nestjs/common';
import { TreadmillService } from '../treadmill/treadmill.service';
import { CsiPacket } from '../serial/serial.types';
import {
  AthleteSimProfile,
  SimulationState,
  SignalNoiseLevel,
  ATHLETE_PROFILES,
} from './demo-simulator.types';

/**
 * Rich demo simulator — generates physiologically realistic CSI packets
 * that adapt to treadmill speed, athlete profile, fatigue, and signal conditions.
 *
 * All outputs are clearly marked as synthetic / experimental.
 */
@Injectable()
export class DemoSimulatorService {
  private readonly logger = new Logger(DemoSimulatorService.name);

  private profile: AthleteSimProfile = { ...ATHLETE_PROFILES['recreational'] };
  private startTime = Date.now();
  private packetsGenerated = 0;
  private fatigueRate = 0.5; // 0 = none, 1 = fast
  private noiseLevel: SignalNoiseLevel = 'clean';
  private gaitPhase = 0; // 0..2π, continuous gait cycle phase

  private readonly sampleRate = 100; // Hz
  private readonly numSubcarriers = 32;

  constructor(private readonly treadmillService: TreadmillService) {
    this.logger.log('Demo simulator initialized');
  }

  /** Generate a single CSI packet reflecting current simulation state */
  generatePacket(): CsiPacket {
    const treadmill = this.treadmillService.getCurrent();
    const speedKmh = treadmill.speedKph;
    const incline = treadmill.inclinePercent;
    const elapsed = this.getElapsedSeconds();

    // --- Physiological adaptation ---
    const fatigue = this.computeFatigue(elapsed);
    const gaitFreqHz = this.computeGaitFreq(speedKmh, fatigue);
    const breathingBpm = this.computeBreathing(speedKmh, fatigue);
    const heartRateBpm = this.computeHeartRate(speedKmh, incline, fatigue);
    const asymmetry = this.computeAsymmetry(fatigue);

    // Advance gait phase
    const dt = 1 / this.sampleRate;
    this.gaitPhase += 2 * Math.PI * gaitFreqHz * dt;
    if (this.gaitPhase > 2 * Math.PI) this.gaitPhase -= 2 * Math.PI;

    // --- Generate CSI I/Q data ---
    const breathingFreqHz = breathingBpm / 60;
    const heartFreqHz = heartRateBpm / 60;
    const t = elapsed;
    const csiValues: number[] = [];

    for (let sc = 0; sc < this.numSubcarriers; sc++) {
      const scPhase = (sc * Math.PI) / this.numSubcarriers;

      // Amplitude: gait-driven + stride-length-correlated amplitude
      const strideAmpFactor = 1 + speedKmh * 0.03; // faster → bigger motion
      const gaitAmp = 40 * strideAmpFactor * Math.sin(this.gaitPhase + scPhase);

      // Left/right asymmetry: modulate odd gait half-cycles
      const gaitHalf = Math.sin(this.gaitPhase * 0.5 + scPhase);
      const asymmetryMod = gaitHalf > 0 ? 1 + asymmetry : 1 - asymmetry;

      // Fatigue increases amplitude variability (wobble)
      const fatigueNoise = fatigue * 8 * (Math.random() - 0.5);

      const ampBase = 60 + gaitAmp * asymmetryMod + fatigueNoise;

      // Phase: breathing + heart rate encoded
      const breathingPhase =
        Math.sin(2 * Math.PI * breathingFreqHz * t + scPhase * 0.3) * 0.5;
      const heartPhase =
        Math.sin(2 * Math.PI * heartFreqHz * t + scPhase * 0.5) * 0.15;

      // Contact time proxy: broader gait peak at higher contact time
      const contactFactor = this.profile.contactTimeBaseMs / 250;
      const contactPhaseShift = (contactFactor - 1) * 0.1 * Math.sin(this.gaitPhase);

      const phaseVal =
        breathingPhase + heartPhase + contactPhaseShift + this.getPhaseNoise();

      const real = Math.round(ampBase * Math.cos(phaseVal));
      const imag = Math.round(ampBase * Math.sin(phaseVal));
      csiValues.push(real, imag);
    }

    // RSSI with noise
    const rssiBase = -42 + Math.round(Math.sin(t * 0.01) * 3);
    const rssi = rssiBase + this.getRssiNoise();

    this.packetsGenerated++;

    return {
      timestamp: Date.now(),
      rssi,
      channel: 6,
      mac: 'DE:MO:SI:MU:LA:TR',
      csiLength: this.numSubcarriers * 2,
      csiValues,
    };
  }

  /** Get the current simulation state */
  getSimulationState(): SimulationState {
    const treadmill = this.treadmillService.getCurrent();
    const elapsed = this.getElapsedSeconds();
    const fatigue = this.computeFatigue(elapsed);
    const speedKmh = treadmill.speedKph;
    const gaitFreqHz = this.computeGaitFreq(speedKmh, fatigue);

    return {
      profile: { ...this.profile },
      elapsedSeconds: Math.round(elapsed),
      currentGaitFreqHz: parseFloat(gaitFreqHz.toFixed(2)),
      currentCadenceSpm: Math.round(gaitFreqHz * 60),
      currentBreathingBpm: parseFloat(
        this.computeBreathing(speedKmh, fatigue).toFixed(1),
      ),
      currentHeartRateBpm: Math.round(
        this.computeHeartRate(speedKmh, treadmill.inclinePercent, fatigue),
      ),
      fatigueLevel: parseFloat(fatigue.toFixed(3)),
      signalNoiseLevel: this.noiseLevel,
      packetsGenerated: this.packetsGenerated,
      treadmillSpeedKmh: speedKmh,
      treadmillInclinePercent: treadmill.inclinePercent,
      isRunning: treadmill.isRunning,
    };
  }

  /** Returns the current gait phase (0..2π) for syncing pose generation */
  getGaitPhase(): number {
    return this.gaitPhase;
  }

  /** Returns the current fatigue level (0..1) */
  getCurrentFatigue(): number {
    return this.computeFatigue(this.getElapsedSeconds());
  }

  setProfile(profile: AthleteSimProfile): void {
    this.profile = { ...profile };
    this.logger.log(`Athlete profile set: ${profile.name}`);
  }

  reset(): void {
    this.startTime = Date.now();
    this.packetsGenerated = 0;
    this.gaitPhase = 0;
    this.fatigueRate = 0.5;
    this.noiseLevel = 'clean';
    this.profile = { ...ATHLETE_PROFILES['recreational'] };
    this.logger.log('Simulation reset');
  }

  setFatigueRate(rate: number): void {
    this.fatigueRate = Math.max(0, Math.min(1, rate));
    this.logger.log(`Fatigue rate set to ${this.fatigueRate}`);
  }

  setSignalNoise(level: SignalNoiseLevel): void {
    this.noiseLevel = level;
    this.logger.log(`Signal noise level set to ${level}`);
  }

  // --- Private computation methods ---

  private getElapsedSeconds(): number {
    return (Date.now() - this.startTime) / 1000;
  }

  /**
   * Fatigue ramps up over time. fatigueRate controls how fast.
   * Ramp starts at ~5 min by default. FatigueResistance from profile slows it.
   */
  private computeFatigue(elapsedSec: number): number {
    const rampStartSec = 300; // 5 minutes
    if (elapsedSec < rampStartSec) return 0;

    const fatigueTime = elapsedSec - rampStartSec;
    const rampDuration = 1800 * (1 - this.fatigueRate * 0.7); // 540..1800 sec
    const resistance = this.profile.fatigueResistance;
    const raw = (fatigueTime / rampDuration) * (1 - resistance * 0.5);
    return Math.min(1, Math.max(0, raw));
  }

  /**
   * Gait frequency adapts to speed: gaitFreq = 0.5 + speedKmh * 0.2
   * Fatigue slightly increases cadence (shorter, choppier steps).
   */
  private computeGaitFreq(speedKmh: number, fatigue: number): number {
    if (speedKmh <= 0) return 0;
    const baseFreq = 0.5 + speedKmh * 0.2;
    const fatigueBoost = fatigue * 0.15; // fatigued runners tend to shorten stride → higher cadence
    return baseFreq + fatigueBoost;
  }

  /**
   * Breathing rate: resting at low speed, increasing with effort and fatigue.
   */
  private computeBreathing(speedKmh: number, fatigue: number): number {
    const resting = this.profile.restingBreathingBpm;
    const speedFactor = Math.max(0, speedKmh - 4) * 1.2; // ramps above 4 km/h
    const fatigueFactor = fatigue * 6;
    return Math.min(45, resting + speedFactor + fatigueFactor);
  }

  /**
   * Heart rate: resting baseline, increases with speed, incline, and fatigue.
   */
  private computeHeartRate(
    speedKmh: number,
    inclinePercent: number,
    fatigue: number,
  ): number {
    const resting = this.profile.restingHeartRateBpm;
    const speedFactor = Math.max(0, speedKmh - 4) * 6;
    const inclineFactor = inclinePercent * 3;
    const fatigueFactor = fatigue * 25;
    return Math.min(210, resting + speedFactor + inclineFactor + fatigueFactor);
  }

  /**
   * Asymmetry: baseline + fatigue-induced drift.
   */
  private computeAsymmetry(fatigue: number): number {
    return this.profile.asymmetryBaseline + fatigue * 0.04;
  }

  /**
   * Phase noise based on signal noise level.
   */
  private getPhaseNoise(): number {
    const noise = Math.random() - 0.5;
    switch (this.noiseLevel) {
      case 'clean':
        return noise * 0.03;
      case 'moderate':
        return noise * 0.12;
      case 'noisy':
        return noise * 0.35;
    }
  }

  /**
   * RSSI noise: occasional drops for noisy mode.
   */
  private getRssiNoise(): number {
    switch (this.noiseLevel) {
      case 'clean':
        return Math.round((Math.random() - 0.5) * 2);
      case 'moderate':
        return Math.round((Math.random() - 0.5) * 6);
      case 'noisy': {
        // Occasional deep drops
        const drop = Math.random() < 0.05 ? -15 : 0;
        return Math.round((Math.random() - 0.5) * 10) + drop;
      }
    }
  }
}
