import { Module } from '@nestjs/common';
import { SignalModule } from '../signal/signal.module';
import { VitalSignsService } from './vital-signs.service';

@Module({
  imports: [SignalModule],
  providers: [VitalSignsService],
  exports: [VitalSignsService],
})
export class VitalSignsModule {}
