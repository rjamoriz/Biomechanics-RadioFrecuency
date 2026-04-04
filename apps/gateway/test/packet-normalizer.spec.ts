import { normalizePacket } from '../src/ingestion/packet-normalizer';
import { CsiPacket } from '../src/serial/serial.types';

describe('normalizePacket', () => {
  const basePacket: CsiPacket = {
    timestamp: 1000,
    rssi: -50,
    channel: 6,
    mac: 'AA:BB:CC:DD:EE:FF',
    csiValues: [3, 4, 1, 0, -5, 12, 0, 0],
  };

  it('should split interleaved I/Q into amplitude and phase', () => {
    const result = normalizePacket(basePacket, 0);

    // 4 subcarrier pairs: [3,4], [1,0], [-5,12], [0,0]
    expect(result.amplitude).toHaveLength(4);
    expect(result.phase).toHaveLength(4);

    // sqrt(3^2 + 4^2) = 5
    expect(result.amplitude[0]).toBeCloseTo(5, 5);
    // sqrt(1^2 + 0^2) = 1
    expect(result.amplitude[1]).toBeCloseTo(1, 5);
    // sqrt(25 + 144) = 13
    expect(result.amplitude[2]).toBeCloseTo(13, 5);
    // sqrt(0 + 0) = 0
    expect(result.amplitude[3]).toBeCloseTo(0, 5);
  });

  it('should compute atan2 phase', () => {
    const result = normalizePacket(basePacket, 0);
    expect(result.phase[0]).toBeCloseTo(Math.atan2(4, 3), 5);
    expect(result.phase[1]).toBeCloseTo(Math.atan2(0, 1), 5);
  });

  it('should preserve metadata', () => {
    const result = normalizePacket(basePacket, 42);
    expect(result.timestamp).toBe(1000);
    expect(result.rssi).toBe(-50);
    expect(result.channel).toBe(6);
    expect(result.mac).toBe('AA:BB:CC:DD:EE:FF');
    expect(result.packetIndex).toBe(42);
    expect(result.receivedAt).toBeDefined();
  });

  it('should handle empty csiValues', () => {
    const empty: CsiPacket = { ...basePacket, csiValues: [] };
    const result = normalizePacket(empty, 0);
    expect(result.amplitude).toHaveLength(0);
    expect(result.phase).toHaveLength(0);
  });
});
