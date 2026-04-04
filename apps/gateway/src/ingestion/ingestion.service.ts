import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SerialService } from '../serial/serial.service';
import { SerialHealthIndicator } from '../serial/serial.health';
import { normalizePacket } from './packet-normalizer';
import { EventBus } from './event-bus';
import { RingBuffer } from './ring-buffer';
import { NormalizedPacket } from './event-bus';

@Injectable()
export class IngestionService implements OnModuleInit {
  private readonly logger = new Logger(IngestionService.name);
  private packetIndex = 0;
  private readonly buffer = new RingBuffer<NormalizedPacket>(1000);

  constructor(
    private readonly serial: SerialService,
    private readonly health: SerialHealthIndicator,
    private readonly eventBus: EventBus,
  ) {}

  onModuleInit() {
    this.serial.stream$.subscribe((raw) => {
      this.health.recordPacket();
      const normalized = normalizePacket(raw, this.packetIndex++);
      this.buffer.push(normalized);
      this.eventBus.emit(normalized);
    });

    this.logger.log('Ingestion pipeline started');
  }

  getBufferSnapshot(): NormalizedPacket[] {
    return this.buffer.toArray();
  }

  getPacketCount(): number {
    return this.packetIndex;
  }
}
