import { Module } from '@nestjs/common';
import { IngestionModule } from '../ingestion/ingestion.module';
import { MetricsModule } from '../metrics/metrics.module';
import { AutonomousService } from './autonomous.service';

@Module({
  imports: [IngestionModule, MetricsModule],
  providers: [AutonomousService],
  exports: [AutonomousService],
})
export class AutonomousModule {}
