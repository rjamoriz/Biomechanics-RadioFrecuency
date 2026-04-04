import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface NormalizedPacket {
  receivedAt: number;
  timestamp: number;
  rssi: number;
  channel: number;
  mac: string;
  amplitude: number[];
  phase: number[];
  packetIndex: number;
}

@Injectable()
export class EventBus {
  private readonly normalizedPackets$ = new Subject<NormalizedPacket>();
  readonly packets$ = this.normalizedPackets$.asObservable();

  emit(packet: NormalizedPacket) {
    this.normalizedPackets$.next(packet);
  }
}
