'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { sessionSchema, type SessionFormData } from '@/types/session';
import { useCreateSession } from '@/hooks/use-sessions';
import { useAthletes } from '@/hooks/use-athletes';
import { useStations } from '@/hooks/use-stations';
import { useProtocols } from '@/hooks/use-protocols';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { SyntheticMotionWarning } from '@/components/ui/synthetic-motion-warning';
import Link from 'next/link';

export default function NewSessionPage() {
  const router = useRouter();
  const createSession = useCreateSession();
  const { data: athletes } = useAthletes();
  const { data: stations } = useStations();
  const { data: protocols } = useProtocols();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SessionFormData>({
    resolver: zodResolver(sessionSchema),
    defaultValues: { inferredMotionEnabled: false },
  });

  const inferredMotion = watch('inferredMotionEnabled');

  const athleteOptions = (athletes ?? []).map((a) => ({
    value: a.id,
    label: `${a.firstName} ${a.lastName}`,
  }));

  const stationOptions = (stations ?? []).map((s) => ({
    value: s.id,
    label: `${s.name} — ${s.location}`,
  }));

  const protocolOptions = (protocols ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }));

  const onSubmit = (data: SessionFormData) => {
    createSession.mutate(data, {
      onSuccess: () => router.push('/sessions'),
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">New Session</h1>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Select
            label="Athlete"
            required
            placeholder="Select an athlete"
            options={athleteOptions}
            {...register('athleteId')}
            error={errors.athleteId?.message}
          />

          <Select
            label="Station"
            required
            placeholder="Select a station"
            options={stationOptions}
            {...register('stationId')}
            error={errors.stationId?.message}
          />

          <Select
            label="Protocol (optional)"
            placeholder="No protocol"
            options={[{ value: '', label: 'None' }, ...protocolOptions]}
            {...register('protocolId')}
            error={errors.protocolId?.message}
          />

          <Input
            label="Shoe Type"
            placeholder="e.g. Nike Vaporfly 3"
            {...register('shoeType')}
            error={errors.shoeType?.message}
          />

          <Textarea
            label="Operator Notes"
            placeholder="Notes about fatigue state, conditions, etc."
            {...register('operatorNotes')}
            error={errors.operatorNotes?.message}
          />

          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="inferredMotionEnabled"
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              {...register('inferredMotionEnabled')}
            />
            <label htmlFor="inferredMotionEnabled" className="text-sm text-slate-700">
              Enable inferred motion visualization
            </label>
          </div>

          {inferredMotion && <SyntheticMotionWarning />}

          {createSession.isError && (
            <p className="text-sm text-red-600">
              {createSession.error.message}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link href="/sessions">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
            <Button type="submit" loading={createSession.isPending}>
              Create Session
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
