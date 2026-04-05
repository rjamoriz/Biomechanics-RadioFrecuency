import { z } from 'zod';

// ── Zod Schemas ─────────────────────────────────────────────────

export const protocolStageSchema = z.object({
  name: z.string().min(1, 'Stage name is required'),
  durationSeconds: z.coerce.number().min(10, 'Min 10 seconds').max(3600),
  speedKmh: z.coerce.number().min(0).max(25),
  inclinePercent: z.coerce.number().min(0).max(15),
});

export const protocolSchema = z.object({
  name: z.string().min(1, 'Protocol name is required').max(100),
  description: z.string().max(2000).optional().default(''),
  stages: z.array(protocolStageSchema).min(1, 'At least one stage required'),
});

export type ProtocolFormData = z.infer<typeof protocolSchema>;
export type ProtocolStageFormData = z.infer<typeof protocolStageSchema>;

// ── API Response Types ──────────────────────────────────────────

export interface Protocol {
  id: string;
  name: string;
  description: string | null;
  stages: Array<{
    name: string;
    durationSeconds: number;
    speedKmh: number;
    inclinePercent: number;
    orderIndex: number;
  }>;
  createdAt: string;
}
