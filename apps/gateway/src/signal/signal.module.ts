import { Module } from '@nestjs/common';
import { HampelFilter } from './hampel-filter';
import { PhaseUnwrapper } from './phase-unwrapper';
import { BandpassFilter } from './bandpass-filter';
import { SubcarrierSelector } from './subcarrier-selector';
import { BodyVelocityProfile } from './body-velocity-profile';

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
