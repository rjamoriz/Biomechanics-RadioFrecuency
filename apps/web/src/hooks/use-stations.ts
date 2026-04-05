import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Station, StationFormData } from '@/types/station';

export function useStations() {
  return useQuery({
    queryKey: ['stations'],
    queryFn: () => apiFetch<Station[]>('/stations'),
  });
}

export function useStation(id: string) {
  return useQuery({
    queryKey: ['stations', id],
    queryFn: () => apiFetch<Station>(`/stations/${encodeURIComponent(id)}`),
    enabled: !!id,
  });
}

export function useCreateStation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: StationFormData) =>
      apiFetch<Station>('/stations', { method: 'POST', body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['stations'] }),
  });
}

export function useUpdateStation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: StationFormData) =>
      apiFetch<Station>(`/stations/${encodeURIComponent(id)}`, { method: 'PUT', body: data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stations'] });
      qc.invalidateQueries({ queryKey: ['stations', id] });
    },
  });
}
