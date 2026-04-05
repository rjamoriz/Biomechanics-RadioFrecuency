import { athleteSchema } from '@/types/athlete';
import { stationSchema } from '@/types/station';
import { protocolSchema } from '@/types/protocol';
import { sessionSchema } from '@/types/session';

describe('Zod schemas', () => {
  describe('athleteSchema', () => {
    const validAthlete = {
      firstName: 'Juan',
      lastName: 'Perez',
      email: 'juan@example.com',
    };

    it('validates valid data', () => {
      const result = athleteSchema.safeParse(validAthlete);
      expect(result.success).toBe(true);
    });

    it('rejects missing firstName', () => {
      const result = athleteSchema.safeParse({ ...validAthlete, firstName: '' });
      expect(result.success).toBe(false);
    });

    it('rejects invalid email', () => {
      const result = athleteSchema.safeParse({ ...validAthlete, email: 'not-an-email' });
      expect(result.success).toBe(false);
    });
  });

  describe('stationSchema', () => {
    it('rejects invalid MAC address', () => {
      const result = stationSchema.safeParse({
        name: 'Station 1',
        location: 'Gym A',
        txMac: 'INVALID-MAC',
        rxMac: 'AA:BB:CC:DD:EE:FF',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('protocolSchema', () => {
    it('rejects empty stages array', () => {
      const result = protocolSchema.safeParse({
        name: 'Test Protocol',
        stages: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('sessionSchema', () => {
    it('rejects missing athleteId', () => {
      const result = sessionSchema.safeParse({
        athleteId: '',
        stationId: 'station-1',
      });
      expect(result.success).toBe(false);
    });
  });
});
