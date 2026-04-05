import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: SelectOption[];
  error?: string;
  description?: string;
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, name, options, error, description, placeholder, required, className, id, ...props }, ref) => {
    const selectId = id ?? name;
    const descId = description ? `${selectId}-desc` : undefined;
    const errorId = error ? `${selectId}-error` : undefined;

    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label htmlFor={selectId} className="text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
        <select
          ref={ref}
          id={selectId}
          name={name}
          aria-invalid={!!error}
          aria-describedby={[descId, errorId].filter(Boolean).join(' ') || undefined}
          className={cn(
            'rounded-lg border px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
            error ? 'border-red-400 focus:ring-red-500 focus:border-red-500' : 'border-slate-300',
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {description && !error && (
          <p id={descId} className="text-xs text-slate-500">
            {description}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';
