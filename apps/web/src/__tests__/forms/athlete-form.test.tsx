import { athleteSchema } from '@/types/athlete';

describe('Athlete Form — Zod schema validation', () => {
  it('requires firstName', () => {
    const result = athleteSchema.safeParse({
      firstName: '',
      lastName: 'Doe',
      email: 'john@test.com',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const firstNameError = result.error.issues.find((i) => i.path.includes('firstName'));
      expect(firstNameError).toBeDefined();
    }
  });

  it('requires valid email', () => {
    const result = athleteSchema.safeParse({
      firstName: 'John',
      lastName: 'Doe',
      email: 'not-an-email',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const emailError = result.error.issues.find((i) => i.path.includes('email'));
      expect(emailError).toBeDefined();
      expect(emailError?.message).toMatch(/email/i);
    }
  });

  it('accepts valid data', () => {
    const result = athleteSchema.safeParse({
      firstName: 'Maria',
      lastName: 'Garcia',
      email: 'maria@lab.com',
      sport: 'Running',
    });
    expect(result.success).toBe(true);
  });

  it('rejects firstName over 100 chars', () => {
    const result = athleteSchema.safeParse({
      firstName: 'A'.repeat(101),
      lastName: 'X',
      email: 'a@b.com',
    });
    expect(result.success).toBe(false);
  });
});
