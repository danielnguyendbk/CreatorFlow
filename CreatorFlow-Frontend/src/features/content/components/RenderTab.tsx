import { useState } from 'react';
import { Film, Terminal, RefreshCw, AlertCircle } from 'lucide-react';
import { Button, StatusBadge, EmptyState } from '@/components/ui';
import { renderStatusConfig } from '@/utils/statusConfig';
import { formatMs, formatDateTime } from '@/lib/utils';
import { renderApi } from '@/api';
import { notify } from '@/stores/notificationStore';
import { useQueryClient } from '@tanstack/react-query';
import { useContentRenderJobs } from '../useContent';
import type { Content } from '@/types';

interface RenderTabProps {
  content: Content;
}

export function RenderTab({ content }: RenderTabProps) {
  const qc = useQueryClient();
  const { data: jobs, isLoading } = useContentRenderJobs(content.id);
  const [isRetrying, setIsRetrying] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-28 rounded-xl border border-zinc-800 bg-zinc-900/40 animate-pulse" />
        <div className="h-64 rounded-xl border border-zinc-800 bg-zinc-900/40 animate-pulse" />
      </div>
    );
  }

  const job = jobs?.[0]; // Current or most recent render job

  if (!job) {
    return (
      <EmptyState
        icon={Film}
        title="No Render Job Queued"
        description="Rendering will start automatically once all storyboard video clips and audio tracks are verified."
      />
    );
  }

  const meta = renderStatusConfig[job.status];

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await renderApi.retryRenderJob(job.id);
      void qc.invalidateQueries({ queryKey: ['renders'] });
      notify.success('Render job queued for retry', 'Worker engine has scheduled re-encoding.');
    } catch (err) {
      notify.error('Retry failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Job Status Banner */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/70 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-zinc-100">FFmpeg Render Pipeline</h3>
              <StatusBadge meta={meta} size="sm" />
            </div>
            <p className="text-xs text-zinc-400">
              Job ID: <span className="font-mono text-zinc-300">{job.id}</span>
              {job.worker && (
                <>
                  {' '}• Worker: <span className="font-mono text-zinc-300">{job.worker}</span>
                </>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {job.status === 'FAILED' && (
              <Button
                variant="brand"
                size="sm"
                onClick={() => void handleRetry()}
                isLoading={isRetrying}
                className="text-xs"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Retry Render
              </Button>
            )}
          </div>
        </div>

        {/* Progress Bar & Details */}
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-zinc-400">Rendering Progress</span>
              <span className="font-mono text-brand-400">{job.progressPercent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className={`h-full transition-all duration-500 ease-out ${
                  job.status === 'FAILED'
                    ? 'bg-red-500'
                    : job.status === 'SUCCESS'
                    ? 'bg-emerald-500'
                    : 'bg-brand-500'
                }`}
                style={{ width: `${job.progressPercent}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
            <div className="rounded-lg bg-zinc-950/60 p-2.5 border border-zinc-800/80">
              <div className="text-zinc-500 text-[11px]">Started At</div>
              <div className="font-medium text-zinc-200 mt-0.5">
                {job.startedAt ? formatDateTime(job.startedAt) : '—'}
              </div>
            </div>
            <div className="rounded-lg bg-zinc-950/60 p-2.5 border border-zinc-800/80">
              <div className="text-zinc-500 text-[11px]">Duration</div>
              <div className="font-medium text-zinc-200 mt-0.5">
                {job.durationMs ? formatMs(job.durationMs) : '—'}
              </div>
            </div>
            <div className="rounded-lg bg-zinc-950/60 p-2.5 border border-zinc-800/80">
              <div className="text-zinc-500 text-[11px]">Retries</div>
              <div className="font-medium text-zinc-200 mt-0.5">
                {job.retryCount} / {job.maxRetries}
              </div>
            </div>
            <div className="rounded-lg bg-zinc-950/60 p-2.5 border border-zinc-800/80">
              <div className="text-zinc-500 text-[11px]">Output Asset</div>
              <div className="font-mono text-zinc-300 mt-0.5 truncate">
                {job.outputAssetId ?? 'Pending completion'}
              </div>
            </div>
          </div>

          {job.error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <div>
                <strong className="font-semibold">Error:</strong> {job.error}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Terminal Log Console */}
      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-black/90 font-mono text-xs">
        <div className="flex items-center justify-between border-b border-zinc-800/80 bg-zinc-950 px-4 py-2 text-zinc-400">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-brand-400" />
            <span className="font-medium text-zinc-300">Render Console Logs</span>
          </div>
          <span className="text-[11px] text-zinc-500">{job.logs.length} lines</span>
        </div>

        <div className="p-4 max-h-72 overflow-y-auto space-y-1.5 select-text">
          {job.logs.map((line, idx) => {
            const isErr = line.includes('ERROR') || line.includes('Invalid');
            const isDone = line.includes('complete') || line.includes('Output written');
            return (
              <div
                key={idx}
                className={`leading-relaxed text-[11px] ${
                  isErr
                    ? 'text-red-400 font-semibold'
                    : isDone
                    ? 'text-emerald-400 font-medium'
                    : 'text-zinc-400'
                }`}
              >
                {line}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
