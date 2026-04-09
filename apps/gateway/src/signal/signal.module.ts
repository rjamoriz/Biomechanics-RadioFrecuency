import { Module } from '@nestjs/common';
import { HampelFilter } from './hampel-filter';
import { PhaseUnwrapper } from './phase-unwrapper';
import { BandpassFilter } from './bandpass-filter';
import { SubcarrierSelector } from './subcarrier-selector';
import { BodyVelocityProfile } from './body-velocity-profile';

// Note: CoherenceGate, FresnelZoneCalculator, PersistentFieldModel,
// StationFieldModel, FieldModelManager, EnvironmentNormalizer,
// AdaptiveNormalizer, and SignalLinePipeline are pure classes (no DI needed).
// They are instantiated directly by consuming services (e.g. AutonomousService)
// rather than registered as NestJS providers.

@Module({
  providers: [
    HampelFilter,
    PhaseUnwrapper,
    BandpassFilter,
    SubcarrierSelector,
    BodyVelocityProfile,
  ],
  exports: [
    HampelFilter,
    PhaseUnwrapper,
    BandpassFilter,
    SubcarrierSelector,
    BodyVelocityProfile,
  ],
})
export class SignalModule {}
