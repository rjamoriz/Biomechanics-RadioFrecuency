import {
  validationReferenceSchema,
  validationComparisonSchema,
  validationSummarySchema,
} from '@/types/validation';

const validReference = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  sessionId: '660e8400-e29b-41d4-a716-446655440000',
  referenceType: 'imu_csv',
  fileName: 'imu_run_01.csv',
  uploadedAt: '2026-04-01T10:30:00Z',
  rowCount: 12000,
  timeRangeStartMs: 0,
  timeRangeEndMs: 600000,
  columns: ['timestamp', 'accelX', 'accelY', 'accelZ'],
  status: 'uploaded',
};

const validComparison = {
  id: '770e8400-e29b-41d4-a716-446655440000',
  sessionId: '660e8400-e29b-41d4-a716-446655440000',
  referenceId: '550e8400-e29b-41d4-a716-446655440000',
  metric: 'estimatedCadence',
  meanAbsoluteError: 2.3,
  rootMeanSquareError: 3.1,
  correlationCoefficient: 0.92,
  biasEstimate: -0.4,
  limitsOfAgreement: { lower: -6.2, upper: 5.4 },
  sampleCount: 1200,
  validationStatus: 'experimental',
  computedAt: '2026-04-01T11:00:00Z',
};

describe('Validation Zod schemas', () => {
  describe('validationReferenceSchema', () => {
    it('validates a correct reference', () => {
      const result = validationReferenceSchema.safeParse(validReference);
      expect(result.success).toBe(true);
    });

    it('rejects invalid referenceType', () => {
      const result = validationReferenceSchema.safeParse({
        ...validReference,
        referenceType: 'unknown_source',
      });
      expect(result.success).toBe(false);
    });

    it('rejects non-uuid id', () => {
      const result = validationReferenceSchema.safeParse({
        ...validReference,
        id: 'not-a-uuid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('validationComparisonSchema', () => {
    it('validates a correct comparison', () => {
      const result = validationComparisonSchema.safeParse(validComparison);
      expect(result.success).toBe(true);
    });

    it('rejects invalid validationStatus', () => {
      const result = validationComparisonSchema.safeParse({
        ...validComparison,
        validationStatus: 'magic_validated',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing limitsOfAgreement fields', () => {
      const result = validationComparisonSchema.safeParse({
        ...validComparison,
        limitsOfAgreement: { lower: -1 },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('validationSummarySchema', () => {
    it('validates a correct summary', () => {
      const result = validationSummarySchema.safeParse({
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        references: [validReference],
        comparisons: [validComparison],
        overallStatus: 'validated',
        bestCorrelation: 0.92,
        worstMetric: 'contactTimeProxy',
      });
      expect(result.success).toBe(true);
    });

    it('accepts nullable bestCorrelation and worstMetric', () => {
      const result = validationSummarySchema.safeParse({
        sessionId: '660e8400-e29b-41d4-a716-446655440000',
        references: [],
        comparisons: [],
        overallStatus: 'no_reference',
        bestCorrelation: null,
        worstMetric: null,
      });
      expect(result.success).toBe(true);
    });
  });
});
