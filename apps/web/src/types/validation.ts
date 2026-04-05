import { z } from 'zod';

// ── Reference Types ─────────────────────────────────────────────

export const referenceTypeEnum = z.enum([
  'treadmill_console',
  'imu_csv',
  'video_derived_csv',
  'pressure_insole_csv',
  'force_plate_csv',
]);

export type ReferenceType = z.infer<typeof referenceTypeEnum>;

export const referenceStatusEnum = z.enum([
  'uploaded',
  'aligned',
  'validated',
  'error',
]);

export type ReferenceStatus = z.infer<typeof referenceStatusEnum>;

// ── Validation Status ───────────────────────────────────────────

export const validationStatusEnum = z.enum([
  'unvalidated',
  'experimental',
  'station_validated',
  'externally_validated',
]);

export type ValidationStatus = z.infer<typeof validationStatusEnum>;

// ── Schemas ─────────────────────────────────────────────────────

export const validationReferenceSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  referenceType: referenceTypeEnum,
  fileName: z.string(),
  uploadedAt: z.string().datetime(),
  rowCount: z.number().int(),
  timeRangeStartMs: z.number(),
  timeRangeEndMs: z.number(),
  columns: z.array(z.string()),
  status: referenceStatusEnum,
});

export type ValidationReference = z.infer<typeof validationReferenceSchema>;

export const validationComparisonSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  referenceId: z.string().uuid(),
  metric: z.string(),
  meanAbsoluteError: z.number(),
  rootMeanSquareError: z.number(),
  correlationCoefficient: z.number(),
  biasEstimate: z.number(),
  limitsOfAgreement: z.object({ lower: z.number(), upper: z.number() }),
  sampleCount: z.number().int(),
  validationStatus: validationStatusEnum,
  computedAt: z.string().datetime(),
});

export type ValidationComparison = z.infer<typeof validationComparisonSchema>;

export const validationSummarySchema = z.object({
  sessionId: z.string().uuid(),
  references: z.array(validationReferenceSchema),
  comparisons: z.array(validationComparisonSchema),
  overallStatus: z.enum([
    'no_reference',
    'pending_alignment',
    'validated',
    'failed',
  ]),
  bestCorrelation: z.number().nullable(),
  worstMetric: z.string().nullable(),
});

export type ValidationSummary = z.infer<typeof validationSummarySchema>;

// ── Upload payload ──────────────────────────────────────────────

export interface UploadReferencePayload {
  sessionId: string;
  referenceType: ReferenceType;
  file: File;
}
