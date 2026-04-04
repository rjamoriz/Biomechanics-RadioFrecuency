export interface CsiPacket {
  timestamp: number;
  rssi: number;
  channel: number;
  mac: string;
  csiLength: number;
  csiValues: number[];
}

export interface ParseResult {
  success: boolean;
  packet?: CsiPacket;
  error?: string;
  raw: string;
}
