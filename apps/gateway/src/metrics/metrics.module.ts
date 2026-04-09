import { Module } from '@nestjs/common';
import { IngestionModule } from '../ingestion/ingestion.module';
import { VitalSignsModule } from '../vital-signs/vital-signs.module';
import { RealtimeMetricsService } from './realtime-metrics.service';
import { CadenceEstimator } from './cadence-estimator';
import { AsymmetryProxy } from './asymmetry-proxy';
import { ContactTimeProxy } from './contact-time-proxy';
import { FatigueDrift } from './fatigue-drift';
import { SignalQualityService } from './signal-quality.service';
import { ConfidenceService } from './confidence.service';
import { GroundContactDetector } from './ground-contact-detector';
import { StrideLengthEstimator } from './stride-length-estimator';
import { VerticalOscillationEstimator } from './vertical-oscillation-estimator';
import { StepVariabilityCalculator } from './step-variability-calculator';
import { BreathingRateEstimator } from './breathing-rate-estimator';
import { FallDetector } from './fall-detector';
import { GaitAnomalyDetector } from './gait-anomaly-detector';

@Module({
  imports: [IngestionModule, VitalSignsModule],
  providers: [
    RealtimeMetricsService,
    CadenceEstimator,
    AsymmetryProxy,
    ContactTimeProxy,
    FatigueDrift,
    SignalQualityService,
    ConfidenceService,
    { provide: GroundContactDetector, useFactory: () => new GroundContactDetector() },
    StrideLengthEstimator,
    { provide: VerticalOscillationEstimator, useFactory: () => new VerticalOscillationEstimator() },
    { provide: StepVariabilityCalculator, useFactory: () => new StepVariabilityCalculator() },
    { provide: BreathingRateEstimator, useFactory: () => new BreathingRateEstimator() },
    { provide: FallDetector, useFactory: () => new FallDetector() },
    { provide: GaitAnomalyDetector, useFactory: () => new GaitAnomalyDetector() },
  ],
  exports: [
    RealtimeMetricsService,
    SignalQualityService,
    GroundContactDetector,
    StrideLengthEstimator,
    VerticalOscillationEstimator,
    StepVariabilityCalculator,
    BreathingRateEstimator,
    FallDetector,
    GaitAnomalyDetector,
  ],
})
export class MetricsModule {}
