import { Module } from '@nestjs/common';
import { OnnxInferenceService } from './onnx-inference.service';
import { FeatureExtractor } from './feature-extractor';

@Module({
  providers: [OnnxInferenceService, FeatureExtractor],
  exports: [OnnxInferenceService, FeatureExtractor],
})
export class InferenceModule {}
