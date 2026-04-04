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
    const sampleRate = 100; // Hz
    // Physiological frequencies for realistic demo data
    const gaitFreq = 2.8; // Hz (~168 SPM cadence)
    const breathingFreq = 0.25; // Hz (~15 BPM)
    const heartFreq = 1.2; // Hz (~72 BPM)
    const numSubcarriers = 32;

    const interval = setInterval(() => {
      const t = seq / sampleRate;
      const csiValues: number[] = [];

      for (let sc = 0; sc < numSubcarriers; sc++) {
        const scPhase = (sc * Math.PI) / numSubcarriers;
        // Phase encodes breathing + heart rate; amplitude encodes gait
        const ampBase =
          60 +
          40 * Math.sin(2 * Math.PI * gaitFreq * t + scPhase) +
          (Math.random() - 0.5) * 8;
        const phaseVal =
          Math.sin(2 * Math.PI * breathingFreq * t + scPhase * 0.3) * 0.5 +
          Math.sin(2 * Math.PI * heartFreq * t + scPhase * 0.5) * 0.15 +
          (Math.random() - 0.5) * 0.05;

        // Convert amplitude + phase to I/Q pairs
        const real = Math.round(ampBase * Math.cos(phaseVal));
        const imag = Math.round(ampBase * Math.sin(phaseVal));
        csiValues.push(real, imag);
      }

      this.packets$.next({
        timestamp: Date.now(),
        rssi: -42 + Math.round(Math.sin(t * 0.01) * 3),
        channel: 6,
        mac: 'AA:BB:CC:DD:EE:FF',
        csiLength: numSubcarriers * 2,
        csiValues,
      });
      seq++;
    }, 1000 / sampleRate);

    this.packets$.subscribe({
      complete: () => clearInterval(interval),
    });
  }
}
