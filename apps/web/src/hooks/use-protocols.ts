import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Protocol, ProtocolFormData } from '@/types/protocol';

export function useProtocols() {
  return useQuery({
    queryKey: ['protocols'],
    queryFn: () => apiFetch<Protocol[]>('/protocols'),
  });
}

export function useProtocol(id: string) {
  return useQuery({
    queryKey: ['protocols', id],
    queryFn: () => apiFetch<Protocol>(`/protocols/${encodeURIComponent(id)}`),
    enabled: !!id,
  });
}

export function useCreateProtocol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProtocolFormData) =>
      apiFetch<Protocol>('/protocols', { method: 'POST', body: data }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['protocols'] }),
  });
}
