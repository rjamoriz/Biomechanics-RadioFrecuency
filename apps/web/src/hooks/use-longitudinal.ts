import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  TrainingLoad,
  PainReport,
  AthleteBaseline,
  InjuryRiskSummary,
} from '@/types/longitudinal';

// ─── Training loads ───────────────────────────────────────────────────────────

export function useTrainingLoads(athleteId: string) {
  return useQuery({
    queryKey: ['longitudinal', 'training-loads', athleteId],
    queryFn: () =>
      apiFetch<TrainingLoad[]>(
        `/longitudinal/athletes/${encodeURIComponent(athleteId)}/training-loads`,
      ),
    enabled: !!athleteId,
  });
}

export function useTrainingLoadsRange(
  athleteId: string,
  from: string,
  to: string,
) {
  return useQuery({
    queryKey: ['longitudinal', 'training-loads', athleteId, from, to],
    queryFn: () =>
      apiFetch<TrainingLoad[]>(
        `/longitudinal/athletes/${encodeURIComponent(athleteId)}/training-loads/range?from=${from}&to=${to}`,
      ),
    enabled: !!(athleteId && from && to),
  });
}

// ─── Pain reports ─────────────────────────────────────────────────────────────

export function usePainReports(athleteId: string, recentDays?: number) {
  const path = recentDays
    ? `/longitudinal/athletes/${encodeURIComponent(athleteId)}/pain-reports/recent?days=${recentDays}`
    : `/longitudinal/athletes/${encodeURIComponent(athleteId)}/pain-reports`;

  return useQuery({
    queryKey: ['longitudinal', 'pain-reports', athleteId, recentDays ?? 'all'],
    queryFn: () => apiFetch<PainReport[]>(path),
    enabled: !!athleteId,
  });
}

// ─── Baselines ────────────────────────────────────────────────────────────────

export function useAthleteBaselines(athleteId: string) {
  return useQuery({
    queryKey: ['longitudinal', 'baselines', athleteId],
    queryFn: () =>
      apiFetch<AthleteBaseline[]>(
        `/longitudinal/athletes/${encodeURIComponent(athleteId)}/baselines`,
      ),
    enabled: !!athleteId,
  });
}

// ─── Injury-risk summaries ────────────────────────────────────────────────────

export function useInjuryRiskByAthlete(athleteId: string) {
  return useQuery({
    queryKey: ['injury-risk', 'athlete', athleteId],
    queryFn: () =>
      apiFetch<InjuryRiskSummary[]>(
        `/injury-risk/athlete/${encodeURIComponent(athleteId)}`,
      ),
    enabled: !!athleteId,
  });
}
