import { Module } from '@nestjs/common';
import { SerialModule } from '../serial/serial.module';
import { IngestionService } from './ingestion.service';
import { EventBus } from './event-bus';

@Module({
  imports: [SerialModule],
  providers: [IngestionService, EventBus],
  exports: [IngestionService, EventBus],
})
export class IngestionModule {}
