import { cn } from '@/lib/utils';

type ValidationStatus = 'unvalidated' | 'experimental' | 'station_validated' | 'externally_validated';

const statusConfig: Record<ValidationStatus, { label: string; classes: string }> = {
  unvalidated: { label: 'Unvalidated', classes: 'bg-slate-100 text-slate-600' },
  experimental: { label: 'Experimental', classes: 'bg-amber-50 text-amber-700' },
  'station_validated': { label: 'Station Validated', classes: 'bg-blue-50 text-blue-700' },
  'externally_validated': { label: 'Externally Validated', classes: 'bg-green-50 text-green-700' },
};

export function ValidationBadge({
  status,
  className,
}: {
  status: ValidationStatus;
  className?: string;
}) {
  const config = statusConfig[status];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.classes,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
