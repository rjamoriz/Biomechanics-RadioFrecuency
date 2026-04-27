import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type CalibrationStatus =
  | 'NOT_CALIBRATED'
  | 'IN_PROGRESS'
  | 'CALIBRATED'
  | 'EXPIRED';

export interface CalibrationProfile {
  id: string;
  stationId: string;
  status: CalibrationStatus;
  signalQualityScore: number | null;
  notes: string | null;
  expiresAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCalibrationData {
  stationId: string;
  status?: CalibrationStatus;
  signalQualityScore?: number;
  notes?: string;
}

export function useCalibrations(stationId: string) {
  return useQuery({
    queryKey: ['calibrations', stationId],
    queryFn: () =>
      apiFetch<CalibrationProfile[]>(
        `/calibrations/station/${encodeURIComponent(stationId)}`,
      ),
    enabled: !!stationId,
  });
}

export function useCalibrationActive(stationId: string) {
  return useQuery({
    queryKey: ['calibrations', stationId, 'active'],
    queryFn: () =>
      apiFetch<boolean>(
        `/calibrations/station/${encodeURIComponent(stationId)}/active`,
      ),
    enabled: !!stationId,
    refetchInterval: 60_000,
  });
}

export function useCreateCalibration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateCalibrationData) =>
      apiFetch<CalibrationProfile>('/calibrations', {
        method: 'POST',
        body: data,
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['calibrations', vars.stationId] });
    },
  });
}
