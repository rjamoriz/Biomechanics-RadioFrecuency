import { BinaryFrameParser } from '../src/serial/binary-parser';
import { CsiPacket } from '../src/serial/serial.types';

/* ---------- Helpers ---------- */

const SYNC_0 = 0xbe;
const SYNC_1 = 0xef;
const VERSION = 0x01;
const TYPE_CSI = 0x01;
const TYPE_HEARTBEAT = 0x02;

function crc16ccitt(data: number[]): number {
  let crc = 0xffff;
  for (const byte of data) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc;
}

function be16(val: number): number[] {
  return [(val >> 8) & 0xff, val & 0xff];
}

function be32(val: number): number[] {
  return [(val >> 24) & 0xff, (val >> 16) & 0xff, (val >> 8) & 0xff, val & 0xff];
}

/**
 * Build a valid binary frame buffer with proper CRC.
 */
function buildFrame(opts: {
  type?: number;
  sequence?: number;
  timestamp?: number;
  stationId?: number[];
  rssi?: number;
  channel?: number;
  noiseFloor?: number;
  numSubcarriers?: number;
  payload?: number[];
}): Buffer {
  const type = opts.type ?? TYPE_CSI;
  const seq = opts.sequence ?? 0;
  const ts = opts.timestamp ?? 1000;
  const sid = opts.stationId ?? [0xaa, 0xbb, 0xcc, 0xdd];
  const rssi = opts.rssi ?? -50;
  const channel = opts.channel ?? 6;
  const noise = opts.noiseFloor ?? -90;
  const numSub = opts.numSubcarriers ?? (opts.payload ? opts.payload.length / 2 : 0);
  const payload = opts.payload ?? [];
  const payloadLen = numSub * 2;

  /* Build everything from VERSION onward (for CRC) */
  const body: number[] = [
    VERSION,
    type,
    ...be16(seq),
    ...be32(ts),
    ...be16(payloadLen),
    ...sid,
    rssi & 0xff,
    channel,
    noise & 0xff,
    numSub,
    ...payload.map((v) => v & 0xff),
  ];

  const crc = crc16ccitt(body);
  const frame = [SYNC_0, SYNC_1, ...body, ...be16(crc)];
  return Buffer.from(frame);
}

/* ---------- Tests ---------- */

describe('BinaryFrameParser', () => {
  let parser: BinaryFrameParser;

  beforeEach(() => {
    parser = new BinaryFrameParser();
  });

  describe('valid CSI frame', () => {
    it('should parse a CSI frame with known I/Q values', () => {
      const payload = [3, 4, -5, 12, 0, 1, -128, 127]; // 4 subcarriers
      const frame = buildFrame({
        sequence: 42,
        timestamp: 5000,
        rssi: -55,
        channel: 11,
        numSubcarriers: 4,
        payload,
      });

      const packets = parser.feed(frame);

      expect(packets).toHaveLength(1);
      const pkt = packets[0];
      expect(pkt.timestamp).toBe(5000);
      expect(pkt.rssi).toBe(-55);
      expect(pkt.channel).toBe(11);
      expect(pkt.csiLength).toBe(8);
      expect(pkt.csiValues).toEqual([3, 4, -5, 12, 0, 1, -128, 127]);
    });

    it('should preserve station ID as MAC prefix', () => {
      const frame = buildFrame({
        stationId: [0xde, 0xad, 0xbe, 0xef],
        numSubcarriers: 1,
        payload: [10, 20],
      });

      const [pkt] = parser.feed(frame);
      expect(pkt.mac).toBe('DE:AD:BE:EF:00:00');
    });
  });

  describe('CRC validation', () => {
    it('should reject frames with bad CRC', () => {
      const frame = buildFrame({
        numSubcarriers: 2,
        payload: [1, 2, 3, 4],
      });

      /* Corrupt the last byte (CRC low byte) */
      frame[frame.length - 1] ^= 0xff;

      const packets = parser.feed(frame);
      expect(packets).toHaveLength(0);
      expect(parser.stats.crcErrors).toBe(1);
    });

    it('should accept frames with valid CRC', () => {
      const frame = buildFrame({ numSubcarriers: 1, payload: [7, -8] });

      const packets = parser.feed(frame);
      expect(packets).toHaveLength(1);
      expect(parser.stats.crcErrors).toBe(0);
    });
  });

  describe('partial frame assembly', () => {
    it('should assemble a frame split across two feed() calls', () => {
      const frame = buildFrame({
        numSubcarriers: 2,
        payload: [10, 20, -30, 40],
      });

      /* Split at an arbitrary midpoint */
      const mid = Math.floor(frame.length / 2);
      const part1 = frame.subarray(0, mid);
      const part2 = frame.subarray(mid);

      const packets1 = parser.feed(part1);
      expect(packets1).toHaveLength(0);

      const packets2 = parser.feed(part2);
      expect(packets2).toHaveLength(1);
      expect(packets2[0].csiValues).toEqual([10, 20, -30, 40]);
    });

    it('should assemble a frame fed byte-by-byte', () => {
      const frame = buildFrame({
        numSubcarriers: 1,
        payload: [5, -5],
      });

      let result: CsiPacket[] = [];
      for (let i = 0; i < frame.length; i++) {
        result = result.concat(parser.feed(Buffer.from([frame[i]])));
      }

      expect(result).toHaveLength(1);
      expect(result[0].csiValues).toEqual([5, -5]);
    });
  });

  describe('sequence gap detection', () => {
    it('should detect a gap in sequence numbers', () => {
      const frame1 = buildFrame({ sequence: 10, numSubcarriers: 1, payload: [1, 2] });
      const frame2 = buildFrame({ sequence: 13, numSubcarriers: 1, payload: [3, 4] });

      parser.feed(frame1);
      parser.feed(frame2);

      expect(parser.stats.sequenceGaps).toBe(1);
    });

    it('should not report gap for consecutive sequences', () => {
      const frame1 = buildFrame({ sequence: 100, numSubcarriers: 1, payload: [1, 2] });
      const frame2 = buildFrame({ sequence: 101, numSubcarriers: 1, payload: [3, 4] });

      parser.feed(frame1);
      parser.feed(frame2);

      expect(parser.stats.sequenceGaps).toBe(0);
    });

    it('should handle sequence wrapping (0xFFFF → 0)', () => {
      const frame1 = buildFrame({ sequence: 0xffff, numSubcarriers: 1, payload: [1, 2] });
      const frame2 = buildFrame({ sequence: 0, numSubcarriers: 1, payload: [3, 4] });

      parser.feed(frame1);
      parser.feed(frame2);

      expect(parser.stats.sequenceGaps).toBe(0);
    });
  });

  describe('heartbeat frames', () => {
    it('should not emit a CsiPacket for heartbeat frames', () => {
      const frame = buildFrame({
        type: TYPE_HEARTBEAT,
        sequence: 1,
        numSubcarriers: 0,
        payload: [],
      });

      const packets = parser.feed(frame);
      expect(packets).toHaveLength(0);
      expect(parser.stats.heartbeatsReceived).toBe(1);
      expect(parser.stats.framesReceived).toBe(1);
    });
  });

  describe('malformed frame recovery', () => {
    it('should skip garbage bytes and parse next valid frame', () => {
      const garbage = Buffer.from([0x00, 0xff, 0x42, 0x13, 0x37, 0xde, 0xad]);
      const valid = buildFrame({
        sequence: 7,
        numSubcarriers: 1,
        payload: [99, -99],
      });

      const combined = Buffer.concat([garbage, valid]);
      const packets = parser.feed(combined);

      expect(packets).toHaveLength(1);
      expect(packets[0].csiValues).toEqual([99, -99]);
    });

    it('should recover after a CRC-failed frame', () => {
      const bad = buildFrame({ sequence: 0, numSubcarriers: 1, payload: [1, 2] });
      bad[bad.length - 1] ^= 0xff; /* corrupt CRC */

      const good = buildFrame({ sequence: 1, numSubcarriers: 1, payload: [3, 4] });

      const combined = Buffer.concat([bad, good]);
      const packets = parser.feed(combined);

      expect(packets).toHaveLength(1);
      expect(packets[0].csiValues).toEqual([3, 4]);
      expect(parser.stats.crcErrors).toBe(1);
    });
  });

  describe('multiple frames in single feed', () => {
    it('should parse two consecutive frames in one chunk', () => {
      const f1 = buildFrame({ sequence: 0, numSubcarriers: 1, payload: [1, 2] });
      const f2 = buildFrame({ sequence: 1, numSubcarriers: 1, payload: [3, 4] });

      const packets = parser.feed(Buffer.concat([f1, f2]));
      expect(packets).toHaveLength(2);
      expect(packets[0].csiValues).toEqual([1, 2]);
      expect(packets[1].csiValues).toEqual([3, 4]);
    });
  });
});
