import { Module } from '@nestjs/common';
import { PoseService } from './pose.service';
import { PoseInferenceAdapter } from './pose-inference.adapter';
import { IngestionModule } from '../ingestion/ingestion.module';
import { InferenceModule } from '../inference/inference.module';

const isDemoMode = process.env.DEMO_MODE === 'true';

@Module({
  imports: [
    IngestionModule,
    InferenceModule,
    ...(isDemoMode ? [require('../demo/demo.module').DemoModule] : []),
  ],
  providers: [PoseInferenceAdapter, PoseService],
  exports: [PoseService],
})
export class PoseModule {}
