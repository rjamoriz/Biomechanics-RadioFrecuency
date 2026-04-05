import { z } from 'zod';

// ── Zod Schemas ─────────────────────────────────────────────────

export const athleteSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email address'),
  sport: z.string().max(100).optional().default(''),
  dateOfBirth: z.string().optional().default(''),
  heightCm: z.coerce.number().min(100).max(250).optional(),
  weightKg: z.coerce.number().min(30).max(200).optional(),
  notes: z.string().max(2000).optional().default(''),
});

export type AthleteFormData = z.infer<typeof athleteSchema>;

// ── API Response Types ──────────────────────────────────────────

export interface Athlete {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  sport: string;
  dateOfBirth: string | null;
  heightCm: number | null;
  weightKg: number | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
}
