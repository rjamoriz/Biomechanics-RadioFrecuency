import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../ingestion/event-bus';
import { CadenceEstimator } from './cadence-estimator';
import { AsymmetryProxy } from './asymmetry-proxy';
import { ContactTimeProxy } from './contact-time-proxy';
import { FatigueDrift } from './fatigue-drift';
import { SignalQualityService } from './signal-quality.service';
import { ConfidenceService } from './confidence.service';

export interface RealtimeMetrics {
  timestamp: number;
  estimatedCadence: number;
  symmetryProxy: number;
  contactTimeProxyMs: number;
  fatigueDriftScore: number;
  signalQualityScore: number;
  packetRate: number;
  metricConfidence: number;
}

@Injectable()
export class RealtimeMetricsService implements OnModuleInit {
  private readonly logger = new Logger(RealtimeMetricsService.name);
  private latestMetrics: RealtimeMetrics | null = null;

  constructor(
    private readonly eventBus: EventBus,
    private readonly cadence: CadenceEstimator,
    private readonly asymmetry: AsymmetryProxy,
    private readonly contactTime: ContactTimeProxy,
    private readonly fatigue: FatigueDrift,
    private readonly signalQuality: SignalQualityService,
    private readonly confidence: ConfidenceService,
  ) {}

  onModuleInit() {
    let sampleCount = 0;

    this.eventBus.packets$.subscribe((packet) => {
      const amplitudeMean =
        packet.amplitude.reduce((a, b) => a + b, 0) / packet.amplitude.length;

      this.cadence.update(amplitudeMean);
      this.contactTime.addSample(amplitudeMean, packet.timestamp);
      this.signalQuality.addPacket(packet.rssi);

      sampleCount++;

      // Emit metrics every ~10 packets (~10 Hz output)
      if (sampleCount % 10 === 0) {
        const cadenceVal = this.cadence.getEstimatedCadence();
        const contactTimeVal = this.contactTime.getContactTimeProxyMs();
        this.fatigue.addCadence(cadenceVal);
        this.fatigue.addContactTime(contactTimeVal);

        this.latestMetrics = {
          timestamp: Date.now(),
          estimatedCadence: cadenceVal,
          symmetryProxy: Math.round(this.asymmetry.getSymmetryProxy() * 1000) / 1000,
          contactTimeProxyMs: contactTimeVal,
          fatigueDriftScore: Math.round(this.fatigue.getFatigueDriftScore() * 1000) / 1000,
          signalQualityScore: this.signalQuality.getSignalQualityScore(),
          packetRate: Math.round(this.signalQuality.getPacketRate()),
          metricConfidence: this.confidence.computeConfidence({
            signalQuality: this.signalQuality.getSignalQualityScore(),
            packetRate: this.signalQuality.getPacketRate(),
            isCalibrated: false, // TODO: wire calibration state
            metricStability: 1 - this.fatigue.getFatigueDriftScore(),
          }),
        };
      }
    });

    this.logger.log('Realtime metrics pipeline initialized');
  }

  getLatest(): RealtimeMetrics | null {
    return this.latestMetrics;
  }
}
