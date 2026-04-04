import { Module } from '@nestjs/common';
import { SerialService } from './serial.service';
import { SerialHealthIndicator } from './serial.health';

const isDemoMode = process.env.DEMO_MODE === 'true';

@Module({
  imports: isDemoMode
    ? [require('../demo/demo.module').DemoModule]
    : [],
  providers: [SerialService, SerialHealthIndicator],
  exports: [SerialService, SerialHealthIndicator],
})
export class SerialModule {}
