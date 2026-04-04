import { Logger } from '@nestjs/common';
import { CsiPacket } from './serial.types';

/* ---------- Protocol constants ---------- */

const SYNC_0 = 0xbe;
const SYNC_1 = 0xef;
const FRAME_VERSION = 0x01;

const FRAME_TYPE_CSI = 0x01;
const FRAME_TYPE_HEARTBEAT = 0x02;
const FRAME_TYPE_CALIBRATION = 0x03;

/** Fixed header size: SYNC(2)+VER(1)+TYPE(1)+SEQ(2)+TS(4)+LEN(2)+SID(4)+RSSI(1)+CH(1)+NF(1)+NSUB(1) */
const HEADER_SIZE = 20;
const CRC_SIZE = 2;
const MAX_SUBCARRIERS = 128;
const MAX_PAYLOAD = MAX_SUBCARRIERS * 2;

/* ---------- CRC-CCITT (0xFFFF, poly 0x1021) ---------- */

function crc16ccitt(data: Uint8Array, offset: number, length: number): number {
  let crc = 0xffff;
  for (let i = offset; i < offset + length; i++) {
    crc ^= data[i] << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

/* ---------- Parser state machine ---------- */

const enum State {
  SYNC,
  HEADER,
  PAYLOAD,
  CRC,
}

export interface BinaryFrameStats {
  framesReceived: number;
  crcErrors: number;
  sequenceGaps: number;
  heartbeatsReceived: number;
}

export interface BinaryFrameEvent {
  type: 'csi' | 'heartbeat' | 'calibration';
  packet?: CsiPacket;
  timestamp: number;
  sequence: number;
}

/**
 * Streaming binary frame parser.
 *
 * Feed serial bytes via `feed(chunk)` — returns parsed `CsiPacket[]` for each
 * complete, CRC-valid CSI frame. Heartbeat and calibration frames are tracked
 * internally but don't produce CsiPacket output.
 */
export class BinaryFrameParser {
  private readonly logger = new Logger(BinaryFrameParser.name);

  private state: State = State.SYNC;
  private headerBuf = Buffer.alloc(HEADER_SIZE);
  private headerPos = 0;
  private payloadBuf = Buffer.alloc(MAX_PAYLOAD);
  private payloadPos = 0;
  private crcBuf = Buffer.alloc(CRC_SIZE);
  private crcPos = 0;
  private expectedPayloadLen = 0;
  private lastSequence: number | null = null;
  private syncIndex = 0;

  readonly stats: BinaryFrameStats = {
    framesReceived: 0,
    crcErrors: 0,
    sequenceGaps: 0,
    heartbeatsReceived: 0,
  };

  /**
   * Feed a chunk of bytes from the serial port.
   * Returns an array of parsed CSI packets (may be empty).
   */
  feed(chunk: Buffer): CsiPacket[] {
    const packets: CsiPacket[] = [];

    for (let i = 0; i < chunk.length; i++) {
      const byte = chunk[i];

      switch (this.state) {
        case State.SYNC:
          this.handleSync(byte);
          break;

        case State.HEADER:
          this.headerBuf[this.headerPos++] = byte;
          if (this.headerPos === HEADER_SIZE) {
            this.processHeader();
          }
          break;

        case State.PAYLOAD:
          this.payloadBuf[this.payloadPos++] = byte;
          if (this.payloadPos === this.expectedPayloadLen) {
            this.state = State.CRC;
            this.crcPos = 0;
          }
          break;

        case State.CRC: {
          this.crcBuf[this.crcPos++] = byte;
          if (this.crcPos === CRC_SIZE) {
            const result = this.validateAndEmit();
            if (result) {
              packets.push(result);
            }
            this.resetToSync();
          }
          break;
        }
      }
    }

    return packets;
  }

  private handleSync(byte: number): void {
    if (this.syncIndex === 0 && byte === SYNC_0) {
      this.syncIndex = 1;
    } else if (this.syncIndex === 1 && byte === SYNC_1) {
      /* SYNC complete — fill header buffer with sync bytes and advance */
      this.headerBuf[0] = SYNC_0;
      this.headerBuf[1] = SYNC_1;
      this.headerPos = 2;
      this.state = State.HEADER;
      this.syncIndex = 0;
    } else {
      /* Not a sync sequence — reset */
      this.syncIndex = byte === SYNC_0 ? 1 : 0;
    }
  }

  private processHeader(): void {
    const version = this.headerBuf[2];
    if (version !== FRAME_VERSION) {
      this.logger.warn(`Unknown frame version 0x${version.toString(16)} — skipping`);
      this.resetToSync();
      return;
    }

    /* Read PAYLOAD_LEN (big-endian, offset 10-11) */
    this.expectedPayloadLen = (this.headerBuf[10] << 8) | this.headerBuf[11];

    if (this.expectedPayloadLen > MAX_PAYLOAD) {
      this.logger.warn(`Payload too large: ${this.expectedPayloadLen} — skipping`);
      this.resetToSync();
      return;
    }

    if (this.expectedPayloadLen === 0) {
      /* No payload (e.g. heartbeat frame) — go straight to CRC */
      this.state = State.CRC;
      this.crcPos = 0;
    } else {
      this.state = State.PAYLOAD;
      this.payloadPos = 0;
    }
  }

  private validateAndEmit(): CsiPacket | null {
    /* Build contiguous buffer for CRC check: VERSION..end of PAYLOAD */
    const crcDataLen = (HEADER_SIZE - 2) + this.expectedPayloadLen;
    const crcData = new Uint8Array(crcDataLen);

    /* Copy header bytes starting from VERSION (offset 2) */
    for (let i = 0; i < HEADER_SIZE - 2; i++) {
      crcData[i] = this.headerBuf[i + 2];
    }
    /* Copy payload */
    for (let i = 0; i < this.expectedPayloadLen; i++) {
      crcData[HEADER_SIZE - 2 + i] = this.payloadBuf[i];
    }

    const computed = crc16ccitt(crcData, 0, crcDataLen);
    const received = (this.crcBuf[0] << 8) | this.crcBuf[1];

    if (computed !== received) {
      this.stats.crcErrors++;
      this.logger.warn(
        `CRC mismatch: computed=0x${computed.toString(16)}, received=0x${received.toString(16)} — frame dropped`,
      );
      return null;
    }

    this.stats.framesReceived++;

    /* Parse header fields */
    const frameType = this.headerBuf[3];
    const sequence = (this.headerBuf[4] << 8) | this.headerBuf[5];
    const timestamp =
      (this.headerBuf[6] << 24) |
      (this.headerBuf[7] << 16) |
      (this.headerBuf[8] << 8) |
      this.headerBuf[9];

    /* Sequence gap detection */
    if (this.lastSequence !== null) {
      const expected = (this.lastSequence + 1) & 0xffff;
      if (sequence !== expected) {
        const gap =
          sequence > this.lastSequence
            ? sequence - this.lastSequence - 1
            : 0xffff - this.lastSequence + sequence;
        this.stats.sequenceGaps++;
        this.logger.warn(
          `Sequence gap: expected=${expected}, got=${sequence} (${gap} frames lost)`,
        );
      }
    }
    this.lastSequence = sequence;

    /* Heartbeat — track but don't emit a CsiPacket */
    if (frameType === FRAME_TYPE_HEARTBEAT) {
      this.stats.heartbeatsReceived++;
      this.logger.debug(`Heartbeat received — seq=${sequence}, ts=${timestamp}`);
      return null;
    }

    /* Calibration — track but don't emit yet (future extension) */
    if (frameType === FRAME_TYPE_CALIBRATION) {
      this.logger.debug(`Calibration frame received — seq=${sequence}`);
      return null;
    }

    /* CSI frame — parse into CsiPacket */
    const stationId = this.headerBuf.subarray(12, 16);
    const rssi = this.headerBuf[16] > 127 ? this.headerBuf[16] - 256 : this.headerBuf[16];
    const channel = this.headerBuf[17];
    const numSubcarriers = this.headerBuf[19];

    /* Reconstruct MAC string from station_id (first 4 bytes) + zeroed last 2 */
    const mac = [
      stationId[0], stationId[1], stationId[2], stationId[3], 0x00, 0x00,
    ]
      .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
      .join(':');

    /* Parse I/Q payload as signed int8 values */
    const csiValues: number[] = [];
    for (let i = 0; i < numSubcarriers * 2; i++) {
      const val = this.payloadBuf[i];
      csiValues.push(val > 127 ? val - 256 : val);
    }

    return {
      timestamp: timestamp >>> 0, /* ensure unsigned */
      rssi,
      channel,
      mac,
      csiLength: numSubcarriers * 2,
      csiValues,
    };
  }

  private resetToSync(): void {
    this.state = State.SYNC;
    this.syncIndex = 0;
    this.headerPos = 0;
    this.payloadPos = 0;
    this.crcPos = 0;
    this.expectedPayloadLen = 0;
  }
}
