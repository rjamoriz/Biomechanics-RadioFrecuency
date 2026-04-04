import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subject } from 'rxjs';
import { parseCsiLine } from './serial.parser';
import { CsiPacket } from './serial.types';

@Injectable()
export class SerialService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SerialService.name);
  private port: any = null;
  private readonly packets$ = new Subject<CsiPacket>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  readonly stream$ = this.packets$.asObservable();

  async onModuleInit() {
    const serialPath = process.env.SERIAL_PORT ?? '/dev/ttyUSB0';
    const baudRate = parseInt(process.env.SERIAL_BAUD ?? '115200', 10);
    const demoMode = process.env.DEMO_MODE === 'true';

    if (demoMode) {
      this.logger.warn('DEMO_MODE enabled — generating synthetic CSI packets');
      this.startDemoStream();
      return;
    }

    await this.connect(serialPath, baudRate);
  }

  async onModuleDestroy() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.port?.isOpen) {
      await new Promise<void>((resolve) => this.port.close(() => resolve()));
    }
    this.packets$.complete();
  }

  private async connect(path: string, baudRate: number) {
    try {
      const { SerialPort, ReadlineParser } = await import('serialport');
      this.port = new SerialPort({ path, baudRate, autoOpen: false });
      const parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

      parser.on('data', (line: string) => {
        const result = parseCsiLine(line);
        if (result.success && result.packet) {
          this.packets$.next(result.packet);
        }
      });

      this.port.on('error', (err: Error) => {
        this.logger.error(`Serial error: ${err.message}`);
        this.scheduleReconnect(path, baudRate);
      });

      this.port.on('close', () => {
        this.logger.warn('Serial port closed');
        this.scheduleReconnect(path, baudRate);
      });

      this.port.open((err?: Error | null) => {
        if (err) {
          this.logger.error(`Failed to open ${path}: ${err.message}`);
          this.scheduleReconnect(path, baudRate);
        } else {
          this.logger.log(`Connected to ${path} @ ${baudRate}`);
        }
      });
    } catch (err) {
      this.logger.error(`Serial import/init failed: ${(err as Error).message}`);
      this.scheduleReconnect(path, baudRate);
    }
  }

  private scheduleReconnect(path: string, baudRate: number) {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.logger.log('Attempting serial reconnect...');
      this.connect(path, baudRate);
    }, 5000);
  }

  private startDemoStream() {
    let seq = 0;
    const interval = setInterval(() => {
      const csiValues = Array.from({ length: 64 }, () =>
        Math.round((Math.random() - 0.5) * 200),
      );
      this.packets$.next({
        timestamp: Date.now(),
        rssi: -45 + Math.round(Math.random() * 10),
        channel: 6,
        mac: 'AA:BB:CC:DD:EE:FF',
        csiLength: 64,
        csiValues,
      });
      seq++;
    }, 10); // ~100 Hz demo

    this.packets$.subscribe({
      complete: () => clearInterval(interval),
    });
  }
}
