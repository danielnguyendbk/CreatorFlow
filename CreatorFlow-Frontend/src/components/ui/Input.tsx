import * as React from 'react';
import { cn } from '@/lib/utils';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-zinc-400">
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={cn(
            'h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 text-sm text-zinc-100 placeholder:text-zinc-600',
            'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-0 focus:border-brand-500',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-red-700 focus:ring-red-500',
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        {!error && hint && <p className="text-xs text-zinc-600">{hint}</p>}
      </div>
    );
  },
);
Input.displayName = 'Input';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-xs font-medium text-zinc-400">
            {label}
          </label>
        )}
        <textarea
          id={inputId}
          ref={ref}
          className={cn(
            'w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 resize-none',
            'focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-0 focus:border-brand-500',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-red-700 focus:ring-red-500',
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs text-red-400">{error}</p>}
        {!error && hint && <p className="text-xs text-zinc-600">{hint}</p>}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';
