'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { stationSchema, type StationFormData } from '@/types/station';
import { useCreateStation } from '@/hooks/use-stations';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function NewStationPage() {
  const router = useRouter();
  const createStation = useCreateStation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StationFormData>({
    resolver: zodResolver(stationSchema),
  });

  const onSubmit = (data: StationFormData) => {
    createStation.mutate(data, {
      onSuccess: () => router.push('/stations'),
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Add Station</h1>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Station Name"
            required
            placeholder="e.g. Treadmill Bay 1"
            {...register('name')}
            error={errors.name?.message}
          />

          <Input
            label="Location"
            required
            placeholder="e.g. Lab A — Room 201"
            {...register('location')}
            error={errors.location?.message}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Transmitter MAC"
              required
              placeholder="AA:BB:CC:DD:EE:FF"
              description="MAC address of the ESP32 transmitter node"
              {...register('txMac')}
              error={errors.txMac?.message}
            />
            <Input
              label="Receiver MAC"
              required
              placeholder="AA:BB:CC:DD:EE:FF"
              description="MAC address of the ESP32 receiver node"
              {...register('rxMac')}
              error={errors.rxMac?.message}
            />
          </div>

          <Input
            label="Treadmill Model"
            placeholder="e.g. Technogym Excite Run 1000"
            {...register('treadmillModel')}
            error={errors.treadmillModel?.message}
          />

          <Textarea
            label="Notes"
            placeholder="Placement details, environment notes, etc."
            {...register('notes')}
            error={errors.notes?.message}
          />

          {createStation.isError && (
            <p className="text-sm text-red-600">
              {createStation.error.message}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link href="/stations">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
            <Button type="submit" loading={createStation.isPending}>
              Create Station
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
