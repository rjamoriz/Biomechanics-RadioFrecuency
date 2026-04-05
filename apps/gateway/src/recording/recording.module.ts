import { Module } from '@nestjs/common';
import { LocalRecorderService } from './local-recorder.service';

@Module({
  providers: [LocalRecorderService],
  exports: [LocalRecorderService],
})
export class RecordingModule {}
