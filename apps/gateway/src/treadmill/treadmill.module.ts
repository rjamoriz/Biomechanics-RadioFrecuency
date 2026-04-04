import { Module } from '@nestjs/common';
import { TreadmillService } from './treadmill.service';
import { ManualInputAdapter } from './manual-input.adapter';
import { MockProtocolAdapter } from './mock-protocol.adapter';

@Module({
  providers: [ManualInputAdapter, MockProtocolAdapter, TreadmillService],
  exports: [TreadmillService],
})
export class TreadmillModule {}
