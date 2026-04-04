import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Subject } from 'rxjs';
import { parseCsiLine } from './serial.parser';
import { BinaryFrameParser } from './binary-parser';
import { CsiPacket } from './serial.types';

const SYNC_0 = 0xbe;
const SYNC_1 = 0xef;

@Injectable()
export class SerialService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SerialService.name);
  private port: any = null;
  private readonly packets$ = new Subject<CsiPacket>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private mode: 'unknown' | 'binary' | 'csv' = 'unknown';
  private binaryParser: BinaryFrameParser | null = null;
  private detectionBuf: number[] = [];

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

      /* Reset detection state on each connection */
      this.mode = 'unknown';
      this.binaryParser = null;
      this.detectionBuf = [];

      let csvParser: any = null;

      /**
       * Raw data handler — performs auto-detection on first bytes, then
       * routes all subsequent data to the appropriate parser.
       */
      this.port.on('data', (chunk: Buffer) => {
        if (this.mode === 'binary') {
          const packets = this.binaryParser!.feed(chunk);
          for (const pkt of packets) {
            this.packets$.next(pkt);
          }
          return;
        }

        if (this.mode === 'csv') {
          /* CSV mode already wired through ReadlineParser — nothing here */
          return;
        }

        /* Auto-detection: buffer first 2 bytes */
        for (let i = 0; i < chunk.length && this.detectionBuf.length < 2; i++) {
          this.detectionBuf.push(chunk[i]);
        }

        if (this.detectionBuf.length >= 2) {
          if (this.detectionBuf[0] === SYNC_0 && this.detectionBuf[1] === SYNC_1) {
            this.mode = 'binary';
            this.binaryParser = new BinaryFrameParser();
            this.logger.log('Auto-detected BINARY frame mode (sync 0xBEEF)');

            /* Feed the detection buffer + remainder of this chunk */
            const initialBuf = Buffer.from(this.detectionBuf);
            const allPackets = this.binaryParser.feed(Buffer.concat([initialBuf, chunk.subarray(this.detectionBuf.length)]));
            for (const pkt of allPackets) {
              this.packets$.next(pkt);
            }
          } else {
            this.mode = 'csv';
            this.logger.log('Auto-detected CSV text mode');

            /* Wire up line-based parser for CSV */
            csvParser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));
            csvParser.on('data', (line: string) => {
              const result = parseCsiLine(line);
              if (result.success && result.packet) {
                this.packets$.next(result.packet);
              }
            });

            /* Re-emit buffered bytes as text to the readline parser isn't feasible,
               but the ReadlineParser handles its own buffering from now on.
               The first partial line (the detection bytes) will be picked up
               naturally since ReadlineParser starts fresh. */
          }
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
