import { type LucideIcon, Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 py-16 text-center',
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 ring-1 ring-zinc-700">
        <Icon className="h-6 w-6 text-zinc-500" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-zinc-300">{title}</p>
        {description && (
          <p className="max-w-xs text-xs text-zinc-600">{description}</p>
        )}
      </div>
      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
