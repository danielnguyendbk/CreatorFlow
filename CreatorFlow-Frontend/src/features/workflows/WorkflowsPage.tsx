import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Workflow,
  Search,
  Hourglass,
  RefreshCw,
  Cpu,
  X,
} from 'lucide-react';
import {
  Button,
  StatusBadge,
  Select,
  EmptyState,
  ErrorState,
} from '@/components/ui';
import { workflowStatusConfig } from '@/utils/statusConfig';
import { formatMs, formatRelative, formatDate } from '@/lib/utils';
import { notify } from '@/stores/notificationStore';
import {
  useWorkflows,
  useRetryWorkflow,
  useCancelWorkflow,
  useResumeWorkflowInstance,
} from './useWorkflows';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Workflow Statuses' },
  { value: 'RUNNING', label: 'Running' },
  { value: 'WAITING', label: 'Waiting on Assets' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

type QuickFilter = 'ALL' | 'RUNNING' | 'WAITING' | 'COMPLETED' | 'FAILED';

export function WorkflowsPage() {
  const navigate = useNavigate();
  const { data: workflows = [], isLoading, error, refetch } = useWorkflows();

  const retryMutation = useRetryWorkflow();
  const cancelMutation = useCancelWorkflow();
  const resumeMutation = useResumeWorkflowInstance();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('ALL');

  // Compute metrics
  const stats = useMemo(() => {
    return {
      total: workflows.length,
      running: workflows.filter((w) => w.status === 'RUNNING').length,
      waiting: workflows.filter((w) => w.status === 'WAITING').length,
      completed: workflows.filter((w) => w.status === 'COMPLETED').length,
      failed: workflows.filter((w) => w.status === 'FAILED').length,
    };
  }, [workflows]);

  // Filter workflows
  const filteredWorkflows = useMemo(() => {
    return workflows.filter((wf) => {
      // Quick filter
      if (quickFilter !== 'ALL' && wf.status !== quickFilter) return false;

      // Status dropdown
      if (statusFilter !== 'ALL' && wf.status !== statusFilter) return false;

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchId = wf.id.toLowerCase().includes(q);
        const matchTitle = wf.contentTitle.toLowerCase().includes(q);
        const matchNode = wf.currentNode?.toLowerCase().includes(q);
        if (!matchId && !matchTitle && !matchNode) return false;
      }

      return true;
    });
  }, [workflows, quickFilter, statusFilter, search]);

  const handleRetry = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await retryMutation.mutateAsync(id);
      notify.success('Workflow Queued', `Workflow ${id} is retrying.`);
    } catch (err) {
      notify.error('Retry failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleCancel = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await cancelMutation.mutateAsync(id);
      notify.info('Workflow Cancelled', id);
    } catch {
      notify.error('Cancel failed');
    }
  };

  const handleResume = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await resumeMutation.mutateAsync(id);
      notify.success('Workflow Resumed', id);
    } catch {
      notify.error('Resume failed');
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
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 sm:text-2xl">
            Workflows
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Monitor active DAG executions, step milestones, and orchestrator instances
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
              View All Contents
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Stat Strip */}
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
          <span className="text-[11px] text-zinc-400 font-medium">All Instances</span>
          <span className="mt-1 font-mono text-xl font-bold text-zinc-100">{stats.total}</span>
        </button>

        <button
          type="button"
          onClick={() => setQuickFilter('RUNNING')}
          className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
            quickFilter === 'RUNNING'
              ? 'border-blue-500 bg-blue-950/30 ring-1 ring-blue-500/30'
              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
          }`}
        >
          <span className="text-[11px] text-blue-400 font-medium">Running</span>
          <span className="mt-1 font-mono text-xl font-bold text-blue-300">{stats.running}</span>
        </button>

        <button
          type="button"
          onClick={() => setQuickFilter('WAITING')}
          className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
            quickFilter === 'WAITING'
              ? 'border-amber-500 bg-amber-950/30 ring-1 ring-amber-500/30'
              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
          }`}
        >
          <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
            <Hourglass className="h-3 w-3" />
            Waiting
          </span>
          <span className="mt-1 font-mono text-xl font-bold text-amber-300">{stats.waiting}</span>
        </button>

        <button
          type="button"
          onClick={() => setQuickFilter('COMPLETED')}
          className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
            quickFilter === 'COMPLETED'
              ? 'border-emerald-500 bg-emerald-950/30 ring-1 ring-emerald-500/30'
              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
          }`}
        >
          <span className="text-[11px] text-emerald-400 font-medium">Completed</span>
          <span className="mt-1 font-mono text-xl font-bold text-emerald-300">
            {stats.completed}
          </span>
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

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by workflow ID, content title, active node..."
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

      {/* Table Section */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-16 rounded-xl border border-zinc-800 bg-zinc-900/40 animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Failed to load workflows"
          message={error instanceof Error ? error.message : 'Unknown error'}
          onRetry={() => void refetch()}
        />
      ) : filteredWorkflows.length === 0 ? (
        <EmptyState
          icon={Workflow}
          title="No Workflows Found"
          description={
            hasActiveFilters
              ? 'No workflow instances match your selected filters.'
              : 'Create or convert ideas to content to trigger automated execution workflows.'
          }
          action={hasActiveFilters ? { label: 'Clear Filters', onClick: clearFilters } : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-medium">
                <tr>
                  <th className="py-3 px-4">Workflow & Content</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Active / Last Node</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Retries</th>
                  <th className="py-3 px-4">Started</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {filteredWorkflows.map((wf) => {
                  const meta = workflowStatusConfig[wf.status];

                  return (
                    <tr
                      key={wf.id}
                      onClick={() => navigate(`/workflows/${wf.id}`)}
                      className="cursor-pointer hover:bg-zinc-800/30 transition-colors group"
                    >
                      {/* ID & Title */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1 max-w-sm">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-zinc-200 group-hover:text-brand-300 transition-colors">
                              {wf.contentTitle}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-500">
                            <span>ID: {wf.id}</span>
                            <span>•</span>
                            <span className="text-zinc-400">{wf.contentId}</span>
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <StatusBadge meta={meta} size="sm" />
                      </td>

                      {/* Active Node */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {wf.currentNode ? (
                          <div className="flex items-center gap-1.5">
                            <Cpu className="h-3.5 w-3.5 text-brand-400" />
                            <span className="font-mono text-xs text-zinc-300">
                              {wf.currentNode}
                            </span>
                          </div>
                        ) : (
                          <span className="text-zinc-500">—</span>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono text-zinc-400">
                        {wf.durationMs ? formatMs(wf.durationMs) : 'Running / Waiting'}
                      </td>

                      {/* Retries */}
                      <td className="py-3.5 px-4 whitespace-nowrap font-mono">
                        {wf.retryCount > 0 ? (
                          <span className="text-red-400 font-semibold">{wf.retryCount}</span>
                        ) : (
                          <span className="text-zinc-500">0</span>
                        )}
                      </td>

                      {/* Started */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-zinc-400">
                        <div>{formatRelative(wf.startedAt || wf.createdAt)}</div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {formatDate(wf.startedAt || wf.createdAt)}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {wf.status === 'FAILED' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => void handleRetry(e, wf.id)}
                              className="h-7 px-2 text-xs text-red-400 hover:bg-red-950/20"
                            >
                              Retry
                            </Button>
                          )}
                          {wf.status === 'WAITING' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => void handleResume(e, wf.id)}
                              className="h-7 px-2 text-xs text-amber-400 hover:bg-amber-950/20"
                            >
                              Resume
                            </Button>
                          )}
                          {wf.status === 'RUNNING' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => void handleCancel(e, wf.id)}
                              className="h-7 px-2 text-xs text-zinc-400 hover:text-red-400 hover:bg-zinc-800"
                            >
                              Cancel
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/workflows/${wf.id}`);
                            }}
                            className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-200 group-hover:bg-zinc-800"
                          >
                            Inspect DAG
                          </Button>
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
    </div>
  );
}
