'use client';

import { useParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { stationSchema, type StationFormData } from '@/types/station';
import { useStation, useUpdateStation } from '@/hooks/use-stations';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useEffect } from 'react';

export default function EditStationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { data: station, isLoading } = useStation(params.id);
  const updateStation = useUpdateStation(params.id);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<StationFormData>({
    resolver: zodResolver(stationSchema),
  });

  useEffect(() => {
    if (station) {
      reset({
        name: station.name,
        location: station.location,
        txMac: station.txMac,
        rxMac: station.rxMac,
        treadmillModel: station.treadmillModel ?? '',
        notes: station.notes ?? '',
      });
    }
  }, [station, reset]);

  const onSubmit = (data: StationFormData) => {
    updateStation.mutate(data, {
      onSuccess: () => router.push(`/stations/${params.id}`),
    });
  };

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading station...</p>;
  }

  if (!station) {
    return <p className="text-sm text-slate-500">Station not found.</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Edit {station.name}</h1>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input
            label="Station Name"
            required
            {...register('name')}
            error={errors.name?.message}
          />

          <Input
            label="Location"
            required
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
            {...register('treadmillModel')}
            error={errors.treadmillModel?.message}
          />

          <Textarea
            label="Notes"
            {...register('notes')}
            error={errors.notes?.message}
          />

          {updateStation.isError && (
            <p className="text-sm text-red-600">
              {updateStation.error.message}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link href={`/stations/${params.id}`}>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
            <Button type="submit" loading={updateStation.isPending}>
              Save Changes
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
