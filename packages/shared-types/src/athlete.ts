import { BaseEntity } from './common';

export interface Athlete extends BaseEntity {
  firstName: string;
  lastName: string;
  email?: string;
  dateOfBirth?: string;
  heightCm?: number;
  weightKg?: number;
  dominantSide?: 'left' | 'right';
  sport?: string;
  notes?: string;
  active: boolean;
}

export interface CreateAthleteRequest {
  firstName: string;
  lastName: string;
  email?: string;
  dateOfBirth?: string;
  heightCm?: number;
  weightKg?: number;
  dominantSide?: 'left' | 'right';
  sport?: string;
  notes?: string;
}

export interface UpdateAthleteRequest extends Partial<CreateAthleteRequest> {}
