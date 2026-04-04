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
  ],
  exports: [RealtimeMetricsService, SignalQualityService],
})
export class MetricsModule {}
