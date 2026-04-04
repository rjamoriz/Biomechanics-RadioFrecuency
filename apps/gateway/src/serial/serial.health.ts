import { Injectable } from '@nestjs/common';

@Injectable()
export class SerialHealthIndicator {
  private lastPacketAt: number | null = null;

  recordPacket() {
    this.lastPacketAt = Date.now();
  }

  isHealthy(): boolean {
    if (!this.lastPacketAt) return false;
    return Date.now() - this.lastPacketAt < 5000;
  }

  getStatus() {
    return {
      healthy: this.isHealthy(),
      lastPacketAt: this.lastPacketAt
        ? new Date(this.lastPacketAt).toISOString()
        : null,
      silenceMs: this.lastPacketAt ? Date.now() - this.lastPacketAt : null,
    };
  }
}
