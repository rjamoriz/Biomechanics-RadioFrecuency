import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Session, SessionFormData } from '@/types/session';

export function useSessions() {
  return useQuery({
    queryKey: ['sessions'],
    queryFn: () => apiFetch<Session[]>('/sessions'),
  });
}

export function useSession(id: string) {
  return useQuery({
    queryKey: ['sessions', id],
    queryFn: () => apiFetch<Session>(`/sessions/${encodeURIComponent(id)}`),
    enabled: !!id,
  });
}

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SessionFormData) =>
      apiFetch<Session>('/sessions', { method: 'POST', body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
}
