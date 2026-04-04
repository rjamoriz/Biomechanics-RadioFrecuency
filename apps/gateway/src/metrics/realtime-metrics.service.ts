import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Subject } from 'rxjs';
import { EventBus } from '../ingestion/event-bus';
import { CadenceEstimator } from './cadence-estimator';
import { AsymmetryProxy } from './asymmetry-proxy';
import { ContactTimeProxy } from './contact-time-proxy';
import { FatigueDrift } from './fatigue-drift';
import { SignalQualityService } from './signal-quality.service';
import { ConfidenceService } from './confidence.service';
import { VitalSignsService } from '../vital-signs/vital-signs.service';

export interface RealtimeMetrics {
  timestamp: number;
  estimatedCadence: number;
  stepIntervalEstimate: number;
  symmetryProxy: number;
  contactTimeProxy: number;
  flightTimeProxy: number;
  fatigueDriftScore: number;
  signalQualityScore: number;
  packetRate: number;
  metricConfidence: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  validationStatus: 'unvalidated' | 'experimental' | 'station-validated' | 'externally-validated';
}

@Injectable()
export class RealtimeMetricsService implements OnModuleInit {
  private readonly logger = new Logger(RealtimeMetricsService.name);
  private readonly metrics$ = new Subject<RealtimeMetrics>();
  private latestMetrics: RealtimeMetrics | null = null;

  readonly stream$ = this.metrics$.asObservable();

  constructor(
    private readonly eventBus: EventBus,
    private readonly cadence: CadenceEstimator,
    private readonly asymmetry: AsymmetryProxy,
    private readonly contactTime: ContactTimeProxy,
    private readonly fatigue: FatigueDrift,
    private readonly signalQuality: SignalQualityService,
    private readonly confidence: ConfidenceService,
    private readonly vitalSigns: VitalSignsService,
  ) {}

  onModuleInit() {
    let sampleCount = 0;

    this.eventBus.packets$.subscribe((packet) => {
      const amplitudeMean =
        packet.amplitude.reduce((a, b) => a + b, 0) / packet.amplitude.length;

      this.cadence.update(amplitudeMean);
      this.contactTime.addSample(amplitudeMean, packet.timestamp);
      this.signalQuality.addPacket(packet.rssi);

      // Feed phase data to vital signs extraction
      if (packet.phase.length > 0) {
        this.vitalSigns.pushPhaseSnapshot(packet.phase);
      }

      sampleCount++;

      // Emit metrics every ~10 packets (~10 Hz output)
      if (sampleCount % 10 === 0) {
        const cadenceVal = this.cadence.getEstimatedCadence();
        const contactTimeVal = this.contactTime.getContactTimeProxyMs();
        this.fatigue.addCadence(cadenceVal);
        this.fatigue.addContactTime(contactTimeVal);

        const conf = this.confidence.computeConfidence({
          signalQuality: this.signalQuality.getSignalQualityScore(),
          packetRate: this.signalQuality.getPacketRate(),
          isCalibrated: false, // TODO: wire calibration state
          metricStability: 1 - this.fatigue.getFatigueDriftScore(),
        });

        const stepInterval = cadenceVal > 0 ? 60000 / cadenceVal : 0;

        this.latestMetrics = {
          timestamp: Date.now(),
          estimatedCadence: cadenceVal,
          stepIntervalEstimate: Math.round(stepInterval),
          symmetryProxy: Math.round(this.asymmetry.getSymmetryProxy() * 1000) / 1000,
          contactTimeProxy: contactTimeVal,
          flightTimeProxy: Math.max(0, Math.round(stepInterval - contactTimeVal)),
          fatigueDriftScore: Math.round(this.fatigue.getFatigueDriftScore() * 1000) / 1000,
          signalQualityScore: this.signalQuality.getSignalQualityScore(),
          packetRate: Math.round(this.signalQuality.getPacketRate()),
          metricConfidence: conf,
          confidenceLevel: conf >= 0.7 ? 'high' : conf >= 0.4 ? 'medium' : 'low',
          validationStatus: 'unvalidated',
        };

        this.metrics$.next(this.latestMetrics);
      }
    });

    this.logger.log('Realtime metrics pipeline initialized');
  }

  getLatest(): RealtimeMetrics | null {
    return this.latestMetrics;
  }
}
