import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui';

export function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 py-24 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-900 ring-1 ring-zinc-800">
        <Zap className="h-8 w-8 text-brand-400" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-zinc-100">404 — Page not found</h1>
        <p className="text-sm text-zinc-500">
          The page you're looking for doesn't exist in CreatorFlow.
        </p>
      </div>
      <Link to="/dashboard">
        <Button variant="brand">Back to Dashboard</Button>
      </Link>
    </div>
  );
}
