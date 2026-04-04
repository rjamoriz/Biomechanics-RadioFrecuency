import { Module } from '@nestjs/common';
import { SerialService } from './serial.service';
import { SerialHealthIndicator } from './serial.health';

@Module({
  providers: [SerialService, SerialHealthIndicator],
  exports: [SerialService, SerialHealthIndicator],
})
export class SerialModule {}
