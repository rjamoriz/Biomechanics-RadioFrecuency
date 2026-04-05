'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { athleteSchema, type AthleteFormData } from '@/types/athlete';
import { useCreateAthlete } from '@/hooks/use-athletes';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function NewAthletePage() {
  const router = useRouter();
  const createAthlete = useCreateAthlete();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AthleteFormData>({
    resolver: zodResolver(athleteSchema),
  });

  const onSubmit = (data: AthleteFormData) => {
    createAthlete.mutate(data, {
      onSuccess: () => router.push('/athletes'),
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Add Athlete</h1>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="First Name"
              required
              {...register('firstName')}
              error={errors.firstName?.message}
            />
            <Input
              label="Last Name"
              required
              {...register('lastName')}
              error={errors.lastName?.message}
            />
          </div>

          <Input
            label="Email"
            type="email"
            required
            {...register('email')}
            error={errors.email?.message}
          />

          <Input
            label="Sport"
            placeholder="e.g. Running, Triathlon"
            {...register('sport')}
            error={errors.sport?.message}
          />

          <Input
            label="Date of Birth"
            type="date"
            {...register('dateOfBirth')}
            error={errors.dateOfBirth?.message}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Height (cm)"
              type="number"
              placeholder="170"
              {...register('heightCm')}
              error={errors.heightCm?.message}
            />
            <Input
              label="Weight (kg)"
              type="number"
              placeholder="70"
              {...register('weightKg')}
              error={errors.weightKg?.message}
            />
          </div>

          <Textarea
            label="Notes"
            placeholder="Injury history, preferences, etc."
            {...register('notes')}
            error={errors.notes?.message}
          />

          {createAthlete.isError && (
            <p className="text-sm text-red-600">
              {createAthlete.error.message}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link href="/athletes">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
            <Button type="submit" loading={createAthlete.isPending}>
              Create Athlete
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
