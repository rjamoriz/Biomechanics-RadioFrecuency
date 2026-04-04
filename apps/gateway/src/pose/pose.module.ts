import { Module } from '@nestjs/common';
import { PoseService } from './pose.service';
import { PoseInferenceAdapter } from './pose-inference.adapter';
import { IngestionModule } from '../ingestion/ingestion.module';

@Module({
  imports: [IngestionModule],
  providers: [PoseInferenceAdapter, PoseService],
  exports: [PoseService],
})
export class PoseModule {}
