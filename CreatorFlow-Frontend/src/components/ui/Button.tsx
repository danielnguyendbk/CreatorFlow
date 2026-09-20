import * as React from 'react';
import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'default' | 'outline' | 'ghost' | 'destructive' | 'brand';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'default',
      size = 'md',
      isLoading = false,
      leftIcon: LeftIcon,
      rightIcon: RightIcon,
      children,
      disabled,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          // Base
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900 disabled:pointer-events-none disabled:opacity-50',
          // Variants
          variant === 'default' &&
            'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 ring-1 ring-zinc-700',
          variant === 'outline' &&
            'border border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100',
          variant === 'ghost' &&
            'bg-transparent text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
          variant === 'destructive' &&
            'bg-red-950 text-red-400 ring-1 ring-red-800 hover:bg-red-900 hover:text-red-300',
          variant === 'brand' &&
            'bg-brand-600 text-white hover:bg-brand-500 shadow-sm',
          // Sizes
          size === 'sm' && 'h-7 px-2.5 text-xs',
          size === 'md' && 'h-9 px-3.5 text-sm',
          size === 'lg' && 'h-10 px-5 text-sm',
          size === 'icon' && 'h-9 w-9 p-0',
          className,
        )}
        {...props}
      >
        {isLoading ? (
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        ) : LeftIcon ? (
          <LeftIcon className="h-4 w-4" />
        ) : null}
        {children}
        {!isLoading && RightIcon && <RightIcon className="h-4 w-4" />}
      </button>
    );
  },
);
Button.displayName = 'Button';
