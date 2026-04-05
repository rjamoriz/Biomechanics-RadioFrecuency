import { z } from 'zod';

// ── Zod Schemas ─────────────────────────────────────────────────

export const stationSchema = z.object({
  name: z.string().min(1, 'Station name is required').max(100),
  location: z.string().min(1, 'Location is required').max(200),
  txMac: z
    .string()
    .regex(
      /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/,
      'Invalid MAC address (format: AA:BB:CC:DD:EE:FF)',
    ),
  rxMac: z
    .string()
    .regex(/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/, 'Invalid MAC address'),
  treadmillModel: z.string().max(100).optional().default(''),
  notes: z.string().max(2000).optional().default(''),
});

export type StationFormData = z.infer<typeof stationSchema>;

// ── API Response Types ──────────────────────────────────────────

export interface Station {
  id: string;
  name: string;
  location: string;
  txMac: string;
  rxMac: string;
  treadmillModel: string | null;
  calibrationStatus: string;
  notes: string | null;
  active: boolean;
  createdAt: string;
}
