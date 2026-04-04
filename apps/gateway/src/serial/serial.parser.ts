import { CsiPacket, ParseResult } from './serial.types';

/**
 * Parses a CSI serial line in format:
 * CSI,<timestamp>,<rssi>,<channel>,<mac>,<csi_len>,<val1>,<val2>,...
 */
export function parseCsiLine(line: string): ParseResult {
  const trimmed = line.trim();

  if (!trimmed.startsWith('CSI,')) {
    return { success: false, error: 'Not a CSI line', raw: trimmed };
  }

  const parts = trimmed.split(',');

  if (parts.length < 7) {
    return { success: false, error: 'Too few fields', raw: trimmed };
  }

  const timestamp = parseInt(parts[1], 10);
  const rssi = parseInt(parts[2], 10);
  const channel = parseInt(parts[3], 10);
  const mac = parts[4];
  const csiLength = parseInt(parts[5], 10);

  if (isNaN(timestamp) || isNaN(rssi) || isNaN(channel) || isNaN(csiLength)) {
    return { success: false, error: 'Invalid numeric field', raw: trimmed };
  }

  const csiValues = parts.slice(6).map(Number);

  if (csiValues.some(isNaN)) {
    return { success: false, error: 'Invalid CSI value', raw: trimmed };
  }

  const packet: CsiPacket = {
    timestamp,
    rssi,
    channel,
    mac,
    csiLength,
    csiValues,
  };

  return { success: true, packet, raw: trimmed };
}
