'use client';

import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { protocolSchema, type ProtocolFormData } from '@/types/protocol';
import { useCreateProtocol } from '@/hooks/use-protocols';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';

const defaultStage = {
  name: '',
  durationSeconds: 180,
  speedKmh: 8,
  inclinePercent: 0,
};

export default function NewProtocolPage() {
  const router = useRouter();
  const createProtocol = useCreateProtocol();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ProtocolFormData>({
    resolver: zodResolver(protocolSchema),
    defaultValues: { stages: [defaultStage] },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'stages',
  });

  const onSubmit = (data: ProtocolFormData) => {
    createProtocol.mutate(data, {
      onSuccess: () => router.push('/protocols'),
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">New Protocol</h1>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Input
            label="Protocol Name"
            required
            placeholder="e.g. Progressive Overload 5-Stage"
            {...register('name')}
            error={errors.name?.message}
          />

          <Textarea
            label="Description"
            placeholder="Purpose and target population for this protocol"
            {...register('description')}
            error={errors.description?.message}
          />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Stages</h2>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => append(defaultStage)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Stage
              </Button>
            </div>

            {errors.stages?.root && (
              <p className="text-xs text-red-600">{errors.stages.root.message}</p>
            )}

            {fields.map((field, index) => (
              <div
                key={field.id}
                className="rounded-lg border border-slate-200 bg-slate-50 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500">
                    Stage {index + 1}
                  </span>
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Input
                    label="Name"
                    required
                    placeholder="Warm-up"
                    {...register(`stages.${index}.name`)}
                    error={errors.stages?.[index]?.name?.message}
                  />
                  <Input
                    label="Duration (s)"
                    type="number"
                    required
                    placeholder="180"
                    {...register(`stages.${index}.durationSeconds`)}
                    error={errors.stages?.[index]?.durationSeconds?.message}
                  />
                  <Input
                    label="Speed (km/h)"
                    type="number"
                    step="0.1"
                    required
                    placeholder="8.0"
                    {...register(`stages.${index}.speedKmh`)}
                    error={errors.stages?.[index]?.speedKmh?.message}
                  />
                  <Input
                    label="Incline (%)"
                    type="number"
                    step="0.5"
                    required
                    placeholder="0"
                    {...register(`stages.${index}.inclinePercent`)}
                    error={errors.stages?.[index]?.inclinePercent?.message}
                  />
                </div>
              </div>
            ))}
          </div>

          {createProtocol.isError && (
            <p className="text-sm text-red-600">
              {createProtocol.error.message}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <Link href="/protocols">
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </Link>
            <Button type="submit" loading={createProtocol.isPending}>
              Create Protocol
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
