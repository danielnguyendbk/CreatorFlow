import { type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StatusMeta } from '@/utils/statusConfig';

interface BadgeProps {
  meta: StatusMeta;
  className?: string;
  showIcon?: boolean;
  size?: 'sm' | 'md';
}

export function StatusBadge({ meta, className, showIcon = true, size = 'md' }: BadgeProps) {
  const Icon: LucideIcon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md font-medium ring-1',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs',
        meta.bgClass,
        meta.textClass,
        meta.ringClass,
        className,
      )}
    >
      {showIcon && (
        <Icon
          className={cn(
            size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5',
            // Spin loader icons
            meta.icon.displayName === 'Loader2' && 'animate-spin',
            meta.icon.displayName === 'RefreshCw' && 'animate-spin',
          )}
        />
      )}
      {meta.label}
    </span>
  );
}

interface GenericBadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'outline' | 'secondary';
  className?: string;
}

export function Badge({ children, variant = 'default', className }: GenericBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        variant === 'default' && 'bg-zinc-800 text-zinc-300 ring-1 ring-zinc-700',
        variant === 'outline' && 'ring-1 ring-zinc-700 text-zinc-400',
        variant === 'secondary' && 'bg-zinc-900 text-zinc-400',
        className,
      )}
    >
      {children}
    </span>
  );
}
