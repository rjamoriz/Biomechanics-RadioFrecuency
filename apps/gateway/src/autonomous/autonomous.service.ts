/**
 * Autonomous Service — Orchestrator
 *
 * Subscribes to the existing metric pipeline and feeds data through:
 * 1. CoherenceMonitor (CSI phases)
 * 2. GaitStateClassifier (metrics + motion)
 * 3. SessionRuleEngine (all features)
 * 4. StationHealthMonitor (station qualities)
 *
 * Emits composite events on autonomousEvents$ and stationHealthEvents$.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Subject } from 'rxjs';
import { EventBus } from '../ingestion/event-bus';
import { RealtimeMetricsService } from '../metrics/realtime-metrics.service';
import { CoherenceMonitor } from './coherence-monitor';
import { GaitStateClassifier } from './gait-state-classifier';
import { SessionRuleEngine } from './session-rule-engine';
import { StationHealthMonitor } from './station-health-monitor';
import { CoherenceGate, GateDecision } from '../signal/coherence-gate';
import { PersistentFieldModel } from '../signal/field-model';
import {
  AutonomousStateEvent,
  StationHealthEvent,
  SessionFeatures,
  GaitFeatures,
  SignalLineEvent,
  AUTONOMOUS_DISCLAIMER,
} from './autonomous.types';

// ─── Feature tracking for session rules ─────────────────────────────

interface FeatureTracker {
  prevMotionEnergy: number;
  cadenceHistory: number[];
  lastPresenceTime: number;
  lowSignalStart: number;
}

const CADENCE_HISTORY_LEN = 20; // ~2s at 10 Hz
const DEFAULT_STATION_ID = 'station-0';

@Injectable()
export class AutonomousService implements OnModuleInit {
  private readonly logger = new Logger(AutonomousService.name);

  private readonly coherenceMonitor = new CoherenceMonitor();
  private readonly gaitClassifier = new GaitStateClassifier();
  private readonly ruleEngine = new SessionRuleEngine();
  private readonly healthMonitor = new StationHealthMonitor();
  private readonly coherenceGate = new CoherenceGate();
  private readonly fieldModel = new PersistentFieldModel();

  private readonly tracker: FeatureTracker = {
    prevMotionEnergy: 0,
    cadenceHistory: [],
    lastPresenceTime: Date.now(),
    lowSignalStart: 0,
  };

  private readonly autonomousState$ = new Subject<AutonomousStateEvent>();
  private readonly stationHealth$ = new Subject<StationHealthEvent>();
  private readonly signalLine$ = new Subject<SignalLineEvent>();

  readonly autonomousEvents$ = this.autonomousState$.asObservable();
  readonly stationHealthEvents$ = this.stationHealth$.asObservable();
  readonly signalLineEvents$ = this.signalLine$.asObservable();

  private lastGateDecision: GateDecision | null = null;

  private tickCount = 0;

  constructor(
    private readonly eventBus: EventBus,
    private readonly metricsService: RealtimeMetricsService,
  ) {}

  onModuleInit(): void {
    // Subscribe to raw packets for coherence monitoring
    this.eventBus.packets$.subscribe((packet) => {
      if (packet.phase.length > 0) {
        this.coherenceMonitor.processFrame(packet.phase);
      }

      // Feed amplitude to field model for baseline/drift tracking
      if (packet.amplitude.length > 0) {
        this.fieldModel.processFrame(packet.amplitude, Date.now());
      }

      // Update station health with signal-derived quality
      const rssiQuality = Math.max(0, Math.min(1, (packet.rssi + 90) / 60));
      this.healthMonitor.updateStation(DEFAULT_STATION_ID, rssiQuality);
    });

    // Subscribe to metric stream (~10 Hz) for gait + rules
    this.metricsService.stream$.subscribe((metrics) => {
      const coherence = this.coherenceMonitor.getState();

      // Coherence gate: evaluate frame quality BEFORE metrics processing
      const gateDecision = this.coherenceGate.evaluate(
        coherence,
        metrics.signalQualityScore,
      );
      this.lastGateDecision = gateDecision;

      // If gate rejects, still track coherence but skip metric update
      if (!gateDecision.accepted) {
        this.tickCount++;
        // Still emit signal line diagnostics at reduced rate
        if (this.tickCount % 5 === 0) {
          this.emitSignalLineDiagnostics();
        }
        return;
      }

      const motionEnergy = this.estimateMotionEnergy(metrics.signalQualityScore, metrics.estimatedCadence);
      const now = Date.now();

      // Build gait features
      const gaitFeatures: GaitFeatures = {
        estimatedCadence: metrics.estimatedCadence,
        symmetryProxy: metrics.symmetryProxy,
        contactTimeProxy: metrics.contactTimeProxy,
        fatigueDriftScore: metrics.fatigueDriftScore,
        motionEnergy,
        signalQuality: metrics.signalQualityScore,
      };

      const gaitResult = this.gaitClassifier.processFrame(gaitFeatures);

      // Track cadence history for trend detection
      this.tracker.cadenceHistory.push(metrics.estimatedCadence);
      if (this.tracker.cadenceHistory.length > CADENCE_HISTORY_LEN) {
        this.tracker.cadenceHistory.shift();
      }

      // Presence tracking
      if (motionEnergy > 50) {
        this.tracker.lastPresenceTime = now;
      }

      // Low signal tracking
      if (metrics.signalQualityScore < 0.3) {
        if (this.tracker.lowSignalStart === 0) this.tracker.lowSignalStart = now;
      } else {
        this.tracker.lowSignalStart = 0;
      }

      // Build session features
      const coherence = this.coherenceMonitor.getState();
      const sessionFeatures: SessionFeatures = {
        motionEnergy,
        signalQuality: metrics.signalQualityScore,
        estimatedCadence: metrics.estimatedCadence,
        symmetryProxy: metrics.symmetryProxy,
        contactTimeProxy: metrics.contactTimeProxy,
        fatigueDriftScore: metrics.fatigueDriftScore,
        coherence: coherence.coherence,
        prevMotionEnergy: this.tracker.prevMotionEnergy,
        cadenceStable: this.isCadenceStable(),
        cadenceChangePct: this.cadenceChangePct(),
        cadenceDecreasing: this.isCadenceDecreasing(),
        motionDecreasing: motionEnergy < this.tracker.prevMotionEnergy * 0.9,
        secondsSincePresence: (now - this.tracker.lastPresenceTime) / 1000,
        secondsLowSignal: this.tracker.lowSignalStart > 0
          ? (now - this.tracker.lowSignalStart) / 1000
          : 0,
      };

      const ruleResult = this.ruleEngine.processFrame(sessionFeatures);

      this.tracker.prevMotionEnergy = motionEnergy;
      this.tickCount++;

      // Emit autonomous state at ~2 Hz (every 5 ticks at 10 Hz input)
      if (this.tickCount % 5 === 0) {
        this.autonomousState$.next({
          timestamp: now,
          coherence,
          gaitClassification: gaitResult,
          ruleResult,
          disclaimer: AUTONOMOUS_DISCLAIMER,
        });

        // Emit signal line diagnostics alongside autonomous state
        this.emitSignalLineDiagnostics();
      }

      // Emit station health at ~1 Hz (every 10 ticks)
      if (this.tickCount % 10 === 0) {
        const health = this.healthMonitor.getState();
        this.stationHealth$.next({ timestamp: now, health });
      }
    });

    this.logger.log('Autonomous edge intelligence initialized');
  }

  getCoherenceState() {
    return this.coherenceMonitor.getState();
  }

  getGaitClassification() {
    return this.gaitClassifier.getClassification();
  }

  getStationHealth() {
    return this.healthMonitor.getState();
  }

  getCoherenceGateDecision(): GateDecision | null {
    return this.lastGateDecision;
  }

  getFieldModelSnapshot() {
    return this.fieldModel.getSnapshot();
  }

  startFieldCalibration(): void {
    this.fieldModel.startCalibration();
    this.logger.log('Field model calibration started');
  }

  reset(): void {
    this.coherenceMonitor.reset();
    this.gaitClassifier.reset();
    this.ruleEngine.reset();
    this.healthMonitor.reset();
    this.coherenceGate.reset();
    this.fieldModel.reset();
    this.tracker.prevMotionEnergy = 0;
    this.tracker.cadenceHistory = [];
    this.tracker.lastPresenceTime = Date.now();
    this.tracker.lowSignalStart = 0;
    this.tickCount = 0;
    this.lastGateDecision = null;
  }

  // ─── Private helpers ──────────────────────────────────────────────

  private estimateMotionEnergy(signalQuality: number, cadence: number): number {
    // Simple proxy: combine signal activity with cadence
    return Math.round(signalQuality * 100 + cadence * 0.5);
  }

  private isCadenceStable(): boolean {
    const h = this.tracker.cadenceHistory;
    if (h.length < 5) return false;
    const recent = h.slice(-5);
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    if (mean === 0) return true;
    return recent.every((v) => Math.abs(v - mean) / mean < 0.05);
  }

  private cadenceChangePct(): number {
    const h = this.tracker.cadenceHistory;
    if (h.length < 5) return 0;
    const old = h[0];
    const current = h[h.length - 1];
    if (old === 0) return 0;
    return ((current - old) / old) * 100;
  }

  private isCadenceDecreasing(): boolean {
    const h = this.tracker.cadenceHistory;
    if (h.length < 5) return false;
    const mid = Math.floor(h.length / 2);
    const firstHalf = h.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const secondHalf = h.slice(mid).reduce((a, b) => a + b, 0) / (h.length - mid);
    return secondHalf < firstHalf * 0.95;
  }

  private emitSignalLineDiagnostics(): void {
    const fieldSnapshot = this.fieldModel.getSnapshot();
    this.signalLine$.next({
      timestamp: Date.now(),
      gateAcceptanceRate: this.coherenceGate.getAcceptanceRate(),
      fieldModelState: fieldSnapshot.state,
      fieldModelDriftScore: fieldSnapshot.driftScore,
      fieldModelMotionEnergy: fieldSnapshot.motionEnergy,
      fieldModelCalibrationAge: fieldSnapshot.calibrationAge,
      pipelinePassRates: {},
      throughputHz: 0,
      disclaimer: AUTONOMOUS_DISCLAIMER,
    });
  }
}
