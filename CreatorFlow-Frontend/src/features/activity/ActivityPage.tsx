import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  Button,
  StatusBadge,
  Select,
  EmptyState,
  ErrorState,
} from '@/components/ui';
import { severityConfig } from '@/utils/statusConfig';
import { formatDateTime, formatRelative } from '@/lib/utils';
import { useActivityEvents } from './useActivity';

const SEVERITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Severities' },
  { value: 'INFO', label: 'Info' },
  { value: 'SUCCESS', label: 'Success' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'ERROR', label: 'Error' },
];

const ENTITY_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Entities' },
  { value: 'Content', label: 'Content Items' },
  { value: 'WorkflowInstance', label: 'Workflows' },
  { value: 'RenderJob', label: 'Render Jobs' },
  { value: 'PublicationJob', label: 'Publications' },
  { value: 'Asset', label: 'Assets' },
];

type QuickFilter = 'ALL' | 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export function ActivityPage() {
  const { data: events = [], isLoading, error, refetch } = useActivityEvents();

  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [entityFilter, setEntityFilter] = useState<string>('ALL');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('ALL');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Compute metrics
  const stats = useMemo(() => {
    return {
      total: events.length,
      success: events.filter((e) => e.severity === 'SUCCESS').length,
      info: events.filter((e) => e.severity === 'INFO').length,
      warning: events.filter((e) => e.severity === 'WARNING').length,
      error: events.filter((e) => e.severity === 'ERROR').length,
    };
  }, [events]);

  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      // Quick filter
      if (quickFilter !== 'ALL' && event.severity !== quickFilter) return false;

      // Severity dropdown
      if (severityFilter !== 'ALL' && event.severity !== severityFilter) return false;

      // Entity filter
      if (entityFilter !== 'ALL' && event.entityType !== entityFilter) return false;

      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchMsg = event.message.toLowerCase().includes(q);
        const matchType = event.type.toLowerCase().includes(q);
        const matchEntityId = event.entityId?.toLowerCase().includes(q);
        const matchMeta = Object.values(event.metadata).some((v) =>
          v.toLowerCase().includes(q),
        );
        if (!matchMsg && !matchType && !matchEntityId && !matchMeta) return false;
      }

      return true;
    });
  }, [events, quickFilter, severityFilter, entityFilter, search]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasActiveFilters =
    search.trim() !== '' ||
    severityFilter !== 'ALL' ||
    entityFilter !== 'ALL' ||
    quickFilter !== 'ALL';

  const clearFilters = () => {
    setSearch('');
    setSeverityFilter('ALL');
    setEntityFilter('ALL');
    setQuickFilter('ALL');
  };

  const getEntityLink = (entityType: string | null, entityId: string | null) => {
    if (!entityId) return null;
    if (entityType === 'Content') return `/contents/${entityId}`;
    if (entityType === 'WorkflowInstance') return `/workflows/${entityId}`;
    if (entityType === 'RenderJob') return `/render-queue`;
    if (entityType === 'PublicationJob') return `/publication-queue`;
    if (entityType === 'Asset') return `/assets`;
    return null;
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 sm:text-2xl">
            Activity History
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Audit trail of pipeline events, automated milestones, human actions, and system errors
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
          <span className="text-[11px] text-zinc-400 font-medium">All Events</span>
          <span className="mt-1 font-mono text-xl font-bold text-zinc-100">{stats.total}</span>
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
          <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Success
          </span>
          <span className="mt-1 font-mono text-xl font-bold text-emerald-300">{stats.success}</span>
        </button>

        <button
          type="button"
          onClick={() => setQuickFilter('INFO')}
          className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
            quickFilter === 'INFO'
              ? 'border-blue-500 bg-blue-950/30 ring-1 ring-blue-500/30'
              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
          }`}
        >
          <span className="text-[11px] text-blue-400 font-medium flex items-center gap-1">
            <Info className="h-3 w-3" />
            Info
          </span>
          <span className="mt-1 font-mono text-xl font-bold text-blue-300">{stats.info}</span>
        </button>

        <button
          type="button"
          onClick={() => setQuickFilter('WARNING')}
          className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
            quickFilter === 'WARNING'
              ? 'border-amber-500 bg-amber-950/30 ring-1 ring-amber-500/30'
              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
          }`}
        >
          <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Warning
          </span>
          <span className="mt-1 font-mono text-xl font-bold text-amber-300">{stats.warning}</span>
        </button>

        <button
          type="button"
          onClick={() => setQuickFilter('ERROR')}
          className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
            quickFilter === 'ERROR'
              ? 'border-red-500 bg-red-950/30 ring-1 ring-red-500/30'
              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
          }`}
        >
          <span className="text-[11px] text-red-400 font-medium flex items-center gap-1">
            <XCircle className="h-3 w-3" />
            Error
          </span>
          <span className="mt-1 font-mono text-xl font-bold text-red-300">{stats.error}</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search events by message, type, or entity ID..."
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
          <div className="w-40">
            <Select
              options={SEVERITY_OPTIONS}
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          <div className="w-44">
            <Select
              options={ENTITY_OPTIONS}
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
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

      {/* Activity Timeline List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-24 rounded-xl border border-zinc-800 bg-zinc-900/40 animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Failed to load activity logs"
          message={error instanceof Error ? error.message : 'Unknown error'}
          onRetry={() => void refetch()}
        />
      ) : filteredEvents.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No Events Found"
          description={
            hasActiveFilters
              ? 'No activity logs match the selected filter criteria.'
              : 'Pipeline activity and audit events will be logged here as tasks execute.'
          }
          action={hasActiveFilters ? { label: 'Clear Filters', onClick: clearFilters } : undefined}
        />
      ) : (
        <div className="relative pl-6 border-l-2 border-zinc-800 space-y-4 max-w-4xl">
          {filteredEvents.map((event) => {
            const meta = severityConfig[event.severity];
            const isExpanded = expandedIds.has(event.id);
            const hasMetadata = Object.keys(event.metadata).length > 0;
            const entityLink = getEntityLink(event.entityType, event.entityId);

            return (
              <div key={event.id} className="relative group">
                {/* Dot on timeline */}
                <div
                  className={`absolute -left-[31px] top-3.5 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-900 ring-2 ${
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

                {/* Event Card */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 hover:border-zinc-700 transition-colors space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <StatusBadge meta={meta} size="sm" />
                      <span className="font-mono text-xs font-semibold text-zinc-200">
                        {event.type.replace(/_/g, ' ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-zinc-500 font-mono">
                      <span title={formatDateTime(event.timestamp)}>
                        {formatRelative(event.timestamp)}
                      </span>
                    </div>
                  </div>

                  {/* Message */}
                  <p className="text-xs text-zinc-200 leading-relaxed font-sans">
                    {event.message}
                  </p>

                  {/* Linked entity chip & Expand button */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-zinc-800/60 text-[11px]">
                    <div className="flex items-center gap-2">
                      {event.entityType && (
                        <span className="text-zinc-500 font-mono">
                          Target: <span className="text-zinc-400">{event.entityType}</span>
                        </span>
                      )}
                      {entityLink ? (
                        <Link
                          to={entityLink}
                          className="inline-flex items-center gap-1 font-mono text-brand-300 hover:underline"
                        >
                          <span>{event.entityId}</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : event.entityId ? (
                        <span className="font-mono text-zinc-400">{event.entityId}</span>
                      ) : null}
                    </div>

                    {hasMetadata && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(event.id)}
                        className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors"
                      >
                        <span>{isExpanded ? 'Hide Details' : 'View Payload'}</span>
                        {isExpanded ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Expanded Metadata */}
                  {isExpanded && hasMetadata && (
                    <div className="mt-2 rounded-lg bg-black/60 p-3 font-mono text-[11px] text-zinc-300 border border-zinc-800 space-y-1 select-text">
                      {Object.entries(event.metadata).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <span className="text-zinc-500">{k}:</span>
                          <span className="text-zinc-200">{v}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
