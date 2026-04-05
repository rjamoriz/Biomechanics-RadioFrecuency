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
    GroundContactDetector,
    StrideLengthEstimator,
    VerticalOscillationEstimator,
    StepVariabilityCalculator,
  ],
  exports: [
    RealtimeMetricsService,
    SignalQualityService,
    GroundContactDetector,
    StrideLengthEstimator,
    VerticalOscillationEstimator,
    StepVariabilityCalculator,
  ],
})
export class MetricsModule {}
