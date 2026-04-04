import { Module } from '@nestjs/common';
import { OnnxInferenceService } from './onnx-inference.service';
import { FeatureExtractor } from './feature-extractor';
import { ModelRegistryService } from './model-registry.service';

@Module({
  providers: [ModelRegistryService, OnnxInferenceService, FeatureExtractor],
  exports: [ModelRegistryService, OnnxInferenceService, FeatureExtractor],
})
export class InferenceModule {}
