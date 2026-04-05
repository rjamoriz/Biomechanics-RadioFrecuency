import { z } from 'zod';

// ── Zod Schemas ─────────────────────────────────────────────────

export const sessionSchema = z.object({
  athleteId: z.string().min(1, 'Select an athlete'),
  stationId: z.string().min(1, 'Select a station'),
  protocolId: z.string().optional().default(''),
  shoeType: z.string().max(100).optional().default(''),
  operatorNotes: z.string().max(2000).optional().default(''),
  inferredMotionEnabled: z.boolean().default(false),
});

export type SessionFormData = z.infer<typeof sessionSchema>;

// ── API Response Types ──────────────────────────────────────────

export interface Session {
  id: string;
  athleteId: string;
  athleteName: string;
  stationId: string;
  stationName: string;
  protocolId: string | null;
  status: string;
  validationStatus: string;
  shoeType: string | null;
  operatorNotes: string | null;
  inferredMotionEnabled: boolean;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}
