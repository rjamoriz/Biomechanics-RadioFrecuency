import { CsiPacket } from '../serial/serial.types';
import { NormalizedPacket } from './event-bus';

/**
 * Splits interleaved CSI values into amplitude and phase arrays.
 * CSI data from ESP32 is typically [real, imag, real, imag, ...].
 * We compute amplitude = sqrt(real^2 + imag^2) and phase = atan2(imag, real).
 */
export function normalizePacket(
  raw: CsiPacket,
  packetIndex: number,
): NormalizedPacket {
  const amplitude: number[] = [];
  const phase: number[] = [];

  for (let i = 0; i < raw.csiValues.length - 1; i += 2) {
    const real = raw.csiValues[i];
    const imag = raw.csiValues[i + 1];
    amplitude.push(Math.sqrt(real * real + imag * imag));
    phase.push(Math.atan2(imag, real));
  }

  return {
    receivedAt: Date.now(),
    timestamp: raw.timestamp,
    rssi: raw.rssi,
    channel: raw.channel,
    mac: raw.mac,
    amplitude,
    phase,
    packetIndex,
  };
}
