import { cn } from '@/lib/utils';

function getLevel(value: number): { label: string; color: string } {
  if (value >= 0.8) return { label: 'High', color: 'text-green-600' };
  if (value >= 0.5) return { label: 'Medium', color: 'text-amber-600' };
  return { label: 'Low', color: 'text-red-600' };
}

export function ConfidenceIndicator({
  value,
  label = 'Confidence',
  showBar = true,
  className,
}: {
  value: number;
  label?: string;
  showBar?: boolean;
  className?: string;
}) {
  const { label: levelLabel, color } = getLevel(value);
  const percent = Math.round(value * 100);

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500">{label}</span>
        <span className={cn('font-medium', color)}>
          {percent}% — {levelLabel}
        </span>
      </div>
      {showBar && (
        <div className="h-1.5 w-full rounded-full bg-slate-100">
          <div
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              value >= 0.8 ? 'bg-green-500' : value >= 0.5 ? 'bg-amber-500' : 'bg-red-500',
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
