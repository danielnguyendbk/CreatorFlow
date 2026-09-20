import { Activity } from 'lucide-react';
import { StatusBadge, EmptyState } from '@/components/ui';
import { severityConfig } from '@/utils/statusConfig';
import { formatDateTime, formatRelative } from '@/lib/utils';
import { useContentActivity } from '../useContent';

interface ActivityTabProps {
  contentId: string;
}

export function ActivityTab({ contentId }: ActivityTabProps) {
  const { data: events, isLoading } = useContentActivity(contentId);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 rounded-xl border border-zinc-800 bg-zinc-900/40 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No Activity Events Recorded"
        description="Workflow orchestrator execution milestones and automated triggers will be logged here."
      />
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="text-xs text-zinc-400 pb-1">
        Execution Log & Audit Events ({events.length})
      </div>

      <div className="relative pl-6 border-l-2 border-zinc-800 space-y-6">
        {events.map((event) => {
          const meta = severityConfig[event.severity];

          return (
            <div key={event.id} className="relative group">
              {/* Dot on timeline */}
              <div
                className={`absolute -left-[31px] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-900 ring-2 ${
                  event.severity === 'ERROR'
                    ? 'ring-red-500 text-red-400'
                    : event.severity === 'SUCCESS'
                    ? 'ring-emerald-500 text-emerald-400'
                    : event.severity === 'WARNING'
                    ? 'ring-amber-500 text-amber-400'
                    : 'ring-blue-500 text-blue-400'
                }`}
              >
                <div
                  className={`h-1.5 w-1.5 rounded-full ${
                    event.severity === 'ERROR'
                      ? 'bg-red-400'
                      : event.severity === 'SUCCESS'
                      ? 'bg-emerald-400'
                      : event.severity === 'WARNING'
                      ? 'bg-amber-400'
                      : 'bg-blue-400'
                  }`}
                />
              </div>

              {/* Event card */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 hover:border-zinc-700 transition-colors">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge meta={meta} size="sm" />
                    <span className="font-mono text-xs font-semibold text-zinc-200">
                      {event.type.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <span
                    className="text-[11px] text-zinc-500"
                    title={formatDateTime(event.timestamp)}
                  >
                    {formatRelative(event.timestamp)}
                  </span>
                </div>

                <p className="mt-2 text-xs text-zinc-300 leading-relaxed">
                  {event.message}
                </p>

                {/* Metadata tags */}
                {event.metadata && Object.keys(event.metadata).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2 pt-2 border-t border-zinc-800/60 text-[11px] font-mono">
                    {Object.entries(event.metadata).map(([k, v]) => (
                      <span
                        key={k}
                        className="rounded bg-zinc-950 px-2 py-0.5 text-zinc-400 border border-zinc-800/80"
                      >
                        <span className="text-zinc-500">{k}:</span> {v}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
