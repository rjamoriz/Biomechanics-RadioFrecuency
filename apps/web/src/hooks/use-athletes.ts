import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Athlete, AthleteFormData } from '@/types/athlete';

export function useAthletes() {
  return useQuery({
    queryKey: ['athletes'],
    queryFn: () => apiFetch<Athlete[]>('/athletes'),
  });
}

export function useAthlete(id: string) {
  return useQuery({
    queryKey: ['athletes', id],
    queryFn: () => apiFetch<Athlete>(`/athletes/${encodeURIComponent(id)}`),
    enabled: !!id,
  });
}

export function useCreateAthlete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AthleteFormData) =>
      apiFetch<Athlete>('/athletes', { method: 'POST', body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['athletes'] }),
  });
}

export function useUpdateAthlete(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AthleteFormData) =>
      apiFetch<Athlete>(`/athletes/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['athletes'] });
      qc.invalidateQueries({ queryKey: ['athletes', id] });
    },
  });
}
