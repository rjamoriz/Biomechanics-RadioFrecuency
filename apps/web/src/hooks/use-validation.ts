import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  ValidationReference,
  ValidationComparison,
  ValidationSummary,
  UploadReferencePayload,
} from '@/types/validation';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080/api';

export function useValidation(sessionId: string) {
  const qc = useQueryClient();

  const references = useQuery({
    queryKey: ['validation', sessionId, 'references'],
    queryFn: () =>
      apiFetch<ValidationReference[]>(
        `/sessions/${encodeURIComponent(sessionId)}/validation/references`,
      ),
    enabled: !!sessionId,
  });

  const comparisons = useQuery({
    queryKey: ['validation', sessionId, 'comparisons'],
    queryFn: () =>
      apiFetch<ValidationComparison[]>(
        `/sessions/${encodeURIComponent(sessionId)}/validation/comparisons`,
      ),
    enabled: !!sessionId,
  });

  const summary = useQuery({
    queryKey: ['validation', sessionId, 'summary'],
    queryFn: () =>
      apiFetch<ValidationSummary>(
        `/sessions/${encodeURIComponent(sessionId)}/validation/summary`,
      ),
    enabled: !!sessionId,
  });

  const uploadReference = useMutation({
    mutationFn: async (payload: UploadReferencePayload) => {
      const formData = new FormData();
      formData.append('file', payload.file);
      formData.append('referenceType', payload.referenceType);

      const res = await fetch(
        `${API_URL}/sessions/${encodeURIComponent(payload.sessionId)}/validation/references`,
        { method: 'POST', body: formData },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => 'Upload failed');
        throw new Error(text);
      }
      return res.json() as Promise<ValidationReference>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['validation', sessionId] });
    },
  });

  const triggerComparison = useMutation({
    mutationFn: (referenceId: string) =>
      apiFetch<ValidationComparison[]>(
        `/sessions/${encodeURIComponent(sessionId)}/validation/compare`,
        { method: 'POST', body: { referenceId } },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['validation', sessionId] });
    },
  });

  return {
    references: references.data ?? [],
    comparisons: comparisons.data ?? [],
    summary: summary.data ?? null,
    uploadReference,
    triggerComparison,
    isLoading: references.isLoading || comparisons.isLoading || summary.isLoading,
    error: references.error || comparisons.error || summary.error,
  };
}
