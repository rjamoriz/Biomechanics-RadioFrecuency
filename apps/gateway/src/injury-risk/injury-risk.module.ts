import { Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module';
import { InjuryRiskService } from './injury-risk.service';

@Module({
  imports: [MetricsModule],
  providers: [InjuryRiskService],
  exports: [InjuryRiskService],
})
export class InjuryRiskModule {}
