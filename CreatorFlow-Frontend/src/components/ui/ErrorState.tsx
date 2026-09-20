import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  detail?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  detail,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-950 ring-1 ring-red-800">
        <AlertCircle className="h-6 w-6 text-red-400" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-zinc-200">{title}</p>
        {message && <p className="max-w-sm text-xs text-zinc-500">{message}</p>}
        {detail && (
          <code className="mt-1 block max-w-sm rounded bg-zinc-950 px-2 py-1 text-left text-xs text-red-400">
            {detail}
          </code>
        )}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" leftIcon={RefreshCw} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
