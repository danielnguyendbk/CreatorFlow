import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Film,
  Search,
  RefreshCw,
  Terminal,
  Clock,
  Server,
  Activity,
  X,
} from 'lucide-react';
import {
  Button,
  StatusBadge,
  Badge,
  Select,
  EmptyState,
  ErrorState,
} from '@/components/ui';
import { renderStatusConfig } from '@/utils/statusConfig';
import { formatMs, formatRelative, formatDate } from '@/lib/utils';
import { notify } from '@/stores/notificationStore';
import { useRenderJobs, useRetryRender, useCancelRender } from './useRender';
import { RenderLogModal } from './components/RenderLogModal';
import type { RenderJob } from '@/types';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Render Statuses' },
  { value: 'RENDERING', label: 'Rendering' },
  { value: 'QUEUED', label: 'Queued' },
  { value: 'SUCCESS', label: 'Success' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'RETRYING', label: 'Retrying' },
];

type QuickFilter = 'ALL' | 'RENDERING' | 'QUEUED' | 'SUCCESS' | 'FAILED';

export function RenderQueuePage() {
  const { data: renderJobs = [], isLoading, error, refetch } = useRenderJobs();
  const retryMutation = useRetryRender();
  const cancelMutation = useCancelRender();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('ALL');
  const [selectedJobForLogs, setSelectedJobForLogs] = useState<RenderJob | null>(null);

  // Compute metrics
  const stats = useMemo(() => {
    return {
      total: renderJobs.length,
      rendering: renderJobs.filter((j) => j.status === 'RENDERING').length,
      queued: renderJobs.filter((j) => j.status === 'QUEUED').length,
      success: renderJobs.filter((j) => j.status === 'SUCCESS').length,
      failed: renderJobs.filter((j) => j.status === 'FAILED').length,
    };
  }, [renderJobs]);

  // Filter jobs
  const filteredJobs = useMemo(() => {
    return renderJobs.filter((job) => {
      // Quick filter
      if (quickFilter !== 'ALL' && job.status !== quickFilter) return false;

      // Dropdown filter
      if (statusFilter !== 'ALL' && job.status !== statusFilter) return false;

      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchId = job.id.toLowerCase().includes(q);
        const matchTitle = job.contentTitle.toLowerCase().includes(q);
        const matchWorker = job.worker?.toLowerCase().includes(q);
        if (!matchId && !matchTitle && !matchWorker) return false;
      }

      return true;
    });
  }, [renderJobs, quickFilter, statusFilter, search]);

  const handleRetry = async (id: string, title: string) => {
    try {
      await retryMutation.mutateAsync(id);
      notify.success('Render Queued for Retry', `Re-encoding started for ${title}.`);
    } catch (err) {
      notify.error('Retry failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelMutation.mutateAsync(id);
      notify.info('Render Cancelled', id);
    } catch {
      notify.error('Cancel failed');
    }
  };

  const hasActiveFilters = search.trim() !== '' || statusFilter !== 'ALL' || quickFilter !== 'ALL';

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setQuickFilter('ALL');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 sm:text-2xl">
            Render Queue
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            FFmpeg multi-track video rendering, encoding progress, worker nodes, and compilation logs
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            className="border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh
          </Button>
          <Link to="/contents">
            <Button variant="brand" size="sm" className="text-xs">
              View Contents
            </Button>
          </Link>
        </div>
      </div>

      {/* Worker Pool Status & Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => setQuickFilter('ALL')}
          className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
            quickFilter === 'ALL'
              ? 'border-brand-500 bg-brand-950/30 ring-1 ring-brand-500/30'
              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
          }`}
        >
          <span className="text-[11px] text-zinc-400 font-medium">All Jobs</span>
          <span className="mt-1 font-mono text-xl font-bold text-zinc-100">{stats.total}</span>
        </button>

        <button
          type="button"
          onClick={() => setQuickFilter('RENDERING')}
          className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
            quickFilter === 'RENDERING'
              ? 'border-violet-500 bg-violet-950/30 ring-1 ring-violet-500/30'
              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
          }`}
        >
          <span className="text-[11px] text-violet-400 font-medium flex items-center gap-1">
            <Activity className="h-3 w-3 animate-spin" />
            Rendering
          </span>
          <span className="mt-1 font-mono text-xl font-bold text-violet-300">{stats.rendering}</span>
        </button>

        <button
          type="button"
          onClick={() => setQuickFilter('QUEUED')}
          className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
            quickFilter === 'QUEUED'
              ? 'border-zinc-500 bg-zinc-800/40 ring-1 ring-zinc-500/30'
              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
          }`}
        >
          <span className="text-[11px] text-zinc-400 font-medium flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Queued
          </span>
          <span className="mt-1 font-mono text-xl font-bold text-zinc-300">{stats.queued}</span>
        </button>

        <button
          type="button"
          onClick={() => setQuickFilter('SUCCESS')}
          className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
            quickFilter === 'SUCCESS'
              ? 'border-emerald-500 bg-emerald-950/30 ring-1 ring-emerald-500/30'
              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
          }`}
        >
          <span className="text-[11px] text-emerald-400 font-medium">Success</span>
          <span className="mt-1 font-mono text-xl font-bold text-emerald-300">{stats.success}</span>
        </button>

        <button
          type="button"
          onClick={() => setQuickFilter('FAILED')}
          className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
            quickFilter === 'FAILED'
              ? 'border-red-500 bg-red-950/30 ring-1 ring-red-500/30'
              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
          }`}
        >
          <span className="text-[11px] text-red-400 font-medium">Failed</span>
          <span className="mt-1 font-mono text-xl font-bold text-red-300">{stats.failed}</span>
        </button>
      </div>

      {/* Worker Nodes Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-2.5 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-brand-400" />
          <span className="font-semibold text-zinc-200">FFmpeg Worker Pool:</span>
          <span>2 Workers Online</span>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="text-zinc-300">worker-01</span>
            <Badge variant="outline" className="text-[10px] text-violet-300 border-violet-800">
              Active (render-003)
            </Badge>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-zinc-300">worker-02</span>
            <Badge variant="outline" className="text-[10px] text-emerald-300 border-emerald-800">
              Idle
            </Badge>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by job ID, content title, worker..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900/90 pl-9 pr-8 text-xs text-zinc-200 placeholder-zinc-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="w-48">
            <Select
              options={STATUS_OPTIONS}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-9 text-xs text-zinc-400 hover:text-zinc-200"
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Jobs Table */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-16 rounded-xl border border-zinc-800 bg-zinc-900/40 animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Failed to load render jobs"
          message={error instanceof Error ? error.message : 'Unknown error'}
          onRetry={() => void refetch()}
        />
      ) : filteredJobs.length === 0 ? (
        <EmptyState
          icon={Film}
          title="No Render Jobs Found"
          description={
            hasActiveFilters
              ? 'No jobs match your filter criteria.'
              : 'Video render tasks will appear here as workflows reach the video compilation stage.'
          }
          action={hasActiveFilters ? { label: 'Clear Filters', onClick: clearFilters } : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-medium">
                <tr>
                  <th className="py-3 px-4">Job & Content</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Progress</th>
                  <th className="py-3 px-4">Worker</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Started</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {filteredJobs.map((job) => {
                  const meta = renderStatusConfig[job.status];

                  return (
                    <tr key={job.id} className="hover:bg-zinc-800/30 transition-colors">
                      {/* Job & Content */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1 max-w-sm">
                          <Link
                            to={`/contents/${job.contentId}`}
                            className="font-semibold text-zinc-200 hover:text-brand-300 transition-colors"
                          >
                            {job.contentTitle}
                          </Link>
                          <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
                            <span>ID: {job.id}</span>
                            <span>•</span>
                            <span className="text-zinc-400">{job.contentId}</span>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <StatusBadge meta={meta} size="sm" />
                      </td>

                      {/* Progress */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="w-32 space-y-1">
                          <div className="flex justify-between text-[11px] font-mono">
                            <span className="text-zinc-400">{job.progressPercent}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className={`h-full transition-all duration-300 ${
                                job.status === 'FAILED'
                                  ? 'bg-red-500'
                                  : job.status === 'SUCCESS'
                                  ? 'bg-emerald-500'
                                  : 'bg-violet-500'
                              }`}
                              style={{ width: `${job.progressPercent}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Worker */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-zinc-400">
                        {job.worker ?? '—'}
                      </td>

                      {/* Duration */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-zinc-400">
                        {job.durationMs ? formatMs(job.durationMs) : 'In progress'}
                      </td>

                      {/* Started */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-zinc-400">
                        <div>{job.startedAt ? formatRelative(job.startedAt) : 'Queued'}</div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {job.startedAt ? formatDate(job.startedAt) : ''}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedJobForLogs(job)}
                            className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-200"
                          >
                            <Terminal className="mr-1 h-3 w-3" />
                            Logs
                          </Button>

                          {job.status === 'FAILED' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleRetry(job.id, job.contentTitle)}
                              className="h-7 px-2 text-xs text-red-400 hover:bg-red-950/20"
                            >
                              Retry
                            </Button>
                          )}

                          {job.status === 'RENDERING' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleCancel(job.id)}
                              className="h-7 px-2 text-xs text-zinc-400 hover:text-red-400"
                            >
                              Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Log Viewer Modal */}
      <RenderLogModal
        open={Boolean(selectedJobForLogs)}
        onClose={() => setSelectedJobForLogs(null)}
        job={selectedJobForLogs}
      />
    </div>
  );
}
