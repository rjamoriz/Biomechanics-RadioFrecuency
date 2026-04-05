import { forwardRef } from 'react';
import { cn } from '@/lib/utils';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  description?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, name, error, description, required, className, id, ...props }, ref) => {
    const textareaId = id ?? name;
    const descId = description ? `${textareaId}-desc` : undefined;
    const errorId = error ? `${textareaId}-error` : undefined;

    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label htmlFor={textareaId} className="text-sm font-medium text-slate-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
        <textarea
          ref={ref}
          id={textareaId}
          name={name}
          rows={3}
          aria-invalid={!!error}
          aria-describedby={[descId, errorId].filter(Boolean).join(' ') || undefined}
          className={cn(
            'rounded-lg border px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors',
            'placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500',
            error ? 'border-red-400 focus:ring-red-500 focus:border-red-500' : 'border-slate-300',
          )}
          {...props}
        />
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

Textarea.displayName = 'Textarea';
