import { Module } from '@nestjs/common';
import { MetricsModule } from '../metrics/metrics.module';
import { VitalSignsModule } from '../vital-signs/vital-signs.module';
import { SensingController } from './sensing.controller';

@Module({
  imports: [MetricsModule, VitalSignsModule],
  controllers: [SensingController],
})
export class SensingModule {}
