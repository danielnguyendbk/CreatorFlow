import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FileVideo,
  Search,
  ArrowUpDown,
  Hourglass,
  Sparkles,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  Button,
  Select,
  StatusBadge,
  Badge,
  EmptyState,
  ErrorState,
} from '@/components/ui';
import { contentStatusConfig } from '@/utils/statusConfig';
import { formatDate, formatRelative } from '@/lib/utils';
import { useContents } from './useContent';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'DRAFT', label: 'Draft' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'WAITING_FOR_ASSET', label: 'Waiting for Asset' },
  { value: 'RENDERING', label: 'Rendering' },
  { value: 'READY', label: 'Ready' },
  { value: 'SCHEDULED', label: 'Scheduled' },
  { value: 'PUBLISHED', label: 'Published' },
  { value: 'FAILED', label: 'Failed' },
];

const STAGE_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Stages' },
  { value: 'IDEA', label: 'Idea' },
  { value: 'SCRIPT', label: 'Script' },
  { value: 'STORYBOARD', label: 'Storyboard' },
  { value: 'VOICE', label: 'Voice' },
  { value: 'VISUAL_ASSETS', label: 'Visual Assets' },
  { value: 'RENDER', label: 'Render' },
  { value: 'SUBTITLE', label: 'Subtitles' },
  { value: 'PUBLICATION', label: 'Publication' },
];

type QuickFilter = 'ALL' | 'ACTIVE' | 'NEEDS_ASSET' | 'COMPLETED' | 'FAILED';

export function ContentsPage() {
  const navigate = useNavigate();
  const { data: contents = [], isLoading, error, refetch } = useContents();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('ALL');
  const [sortBy, setSortBy] = useState<'createdAt' | 'progress' | 'title'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Filtered & sorted contents
  const filteredContents = useMemo(() => {
    return contents
      .filter((content) => {
        // Quick filter pill logic
        if (quickFilter === 'ACTIVE') {
          if (!['IN_PROGRESS', 'WAITING_FOR_ASSET', 'RENDERING'].includes(content.status)) {
            return false;
          }
        } else if (quickFilter === 'NEEDS_ASSET') {
          if (content.status !== 'WAITING_FOR_ASSET') return false;
        } else if (quickFilter === 'COMPLETED') {
          if (!['READY', 'SCHEDULED', 'PUBLISHED'].includes(content.status)) return false;
        } else if (quickFilter === 'FAILED') {
          if (content.status !== 'FAILED') return false;
        }

        // Status dropdown filter
        if (statusFilter !== 'ALL' && content.status !== statusFilter) {
          return false;
        }

        // Stage dropdown filter
        if (stageFilter !== 'ALL' && content.currentStage !== stageFilter) {
          return false;
        }

        // Search filter
        if (search.trim()) {
          const q = search.toLowerCase();
          const matchTitle = content.title.toLowerCase().includes(q);
          const matchTopic = content.topic.toLowerCase().includes(q);
          const matchNiche = content.niche.toLowerCase().includes(q);
          const matchTags = content.tags.some((t) => t.toLowerCase().includes(q));
          if (!matchTitle && !matchTopic && !matchNiche && !matchTags) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'progress') {
          return sortOrder === 'desc'
            ? b.progressPercent - a.progressPercent
            : a.progressPercent - b.progressPercent;
        }
        if (sortBy === 'title') {
          return sortOrder === 'desc'
            ? b.title.localeCompare(a.title)
            : a.title.localeCompare(b.title);
        }
        // createdAt
        return sortOrder === 'desc'
          ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
  }, [contents, search, statusFilter, stageFilter, quickFilter, sortBy, sortOrder]);

  const stats = useMemo(() => {
    return {
      total: contents.length,
      active: contents.filter((c) =>
        ['IN_PROGRESS', 'WAITING_FOR_ASSET', 'RENDERING'].includes(c.status),
      ).length,
      needsAsset: contents.filter((c) => c.status === 'WAITING_FOR_ASSET').length,
      completed: contents.filter((c) =>
        ['READY', 'SCHEDULED', 'PUBLISHED'].includes(c.status),
      ).length,
      failed: contents.filter((c) => c.status === 'FAILED').length,
    };
  }, [contents]);

  const hasActiveFilters =
    search.trim() !== '' ||
    statusFilter !== 'ALL' ||
    stageFilter !== 'ALL' ||
    quickFilter !== 'ALL';

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setStageFilter('ALL');
    setQuickFilter('ALL');
  };

  const toggleSort = (field: 'createdAt' | 'progress' | 'title') => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with Title and Quick Stats Strip */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 sm:text-2xl">
            Contents
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            End-to-end automation pipelines, production status, and asset stages
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
          <Link to="/ideas">
            <Button variant="brand" size="sm" className="text-xs">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              Generate From Ideas
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Summary Strip */}
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
          <span className="text-[11px] text-zinc-400 font-medium">All Contents</span>
          <span className="mt-1 font-mono text-xl font-bold text-zinc-100">{stats.total}</span>
        </button>

        <button
          type="button"
          onClick={() => setQuickFilter('ACTIVE')}
          className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
            quickFilter === 'ACTIVE'
              ? 'border-blue-500 bg-blue-950/30 ring-1 ring-blue-500/30'
              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
          }`}
        >
          <span className="text-[11px] text-blue-400 font-medium">In Pipeline</span>
          <span className="mt-1 font-mono text-xl font-bold text-blue-300">{stats.active}</span>
        </button>

        <button
          type="button"
          onClick={() => setQuickFilter('NEEDS_ASSET')}
          className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
            quickFilter === 'NEEDS_ASSET'
              ? 'border-amber-500 bg-amber-950/30 ring-1 ring-amber-500/30'
              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
          }`}
        >
          <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
            <Hourglass className="h-3 w-3" />
            Needs Clips
          </span>
          <span className="mt-1 font-mono text-xl font-bold text-amber-300">
            {stats.needsAsset}
          </span>
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
          <span className="text-[11px] text-emerald-400 font-medium">Ready / Published</span>
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

      {/* Filter and Search Controls */}
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by title, topic, tags, niche..."
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
              options={STATUS_OPTIONS}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          <div className="w-40">
            <Select
              options={STAGE_OPTIONS}
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
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

      {/* Content Table State */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-16 rounded-xl border border-zinc-800 bg-zinc-900/40 animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Failed to load contents"
          message={error instanceof Error ? error.message : 'Unknown error occurred.'}
          onRetry={() => void refetch()}
        />
      ) : filteredContents.length === 0 ? (
        <EmptyState
          icon={FileVideo}
          title="No Contents Found"
          description={
            hasActiveFilters
              ? 'No content items match the selected filter criteria.'
              : 'Start by generating ideas and converting them to content.'
          }
          action={
            hasActiveFilters
              ? {
                  label: 'Clear All Filters',
                  onClick: clearFilters,
                }
              : undefined
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-medium">
                <tr>
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort('title')}
                      className="flex items-center gap-1.5 hover:text-zinc-200 transition-colors"
                    >
                      <span>Content & Topic</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Current Stage</th>
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort('progress')}
                      className="flex items-center gap-1.5 hover:text-zinc-200 transition-colors"
                    >
                      <span>Progress</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort('createdAt')}
                      className="flex items-center gap-1.5 hover:text-zinc-200 transition-colors"
                    >
                      <span>Created</span>
                      <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {filteredContents.map((content) => {
                  const meta = contentStatusConfig[content.status];
                  const isWaitingForAsset = content.status === 'WAITING_FOR_ASSET';

                  return (
                    <tr
                      key={content.id}
                      onClick={() => navigate(`/contents/${content.id}`)}
                      className="cursor-pointer hover:bg-zinc-800/30 transition-colors group"
                    >
                      {/* Title & Topic */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-1 max-w-md">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-zinc-200 group-hover:text-brand-300 transition-colors">
                              {content.title}
                            </span>
                            <Badge variant="outline" className="text-[10px] uppercase font-mono">
                              {content.language}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-zinc-400 line-clamp-1">
                            {content.topic}
                          </p>
                          {content.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {content.tags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag}
                                  className="text-[10px] text-zinc-500 font-mono"
                                >
                                  #{tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <StatusBadge meta={meta} size="sm" />
                      </td>

                      {/* Current Stage */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`rounded px-2 py-0.5 font-mono text-[11px] font-medium ${
                              isWaitingForAsset
                                ? 'bg-amber-950/60 text-amber-300 border border-amber-800/40'
                                : 'bg-zinc-800 text-zinc-300 border border-zinc-700/60'
                            }`}
                          >
                            {content.currentStage.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </td>

                      {/* Progress */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="w-28 space-y-1">
                          <div className="flex justify-between text-[11px] font-mono">
                            <span className="text-zinc-400">{content.progressPercent}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                            <div
                              className={`h-full transition-all duration-300 ${
                                content.status === 'FAILED'
                                  ? 'bg-red-500'
                                  : content.status === 'READY' || content.status === 'PUBLISHED'
                                  ? 'bg-emerald-500'
                                  : 'bg-brand-500'
                              }`}
                              style={{ width: `${content.progressPercent}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Created */}
                      <td className="py-3.5 px-4 whitespace-nowrap text-zinc-400">
                        <div className="text-[11px] text-zinc-300">
                          {formatRelative(content.createdAt)}
                        </div>
                        <div className="text-[10px] text-zinc-500 font-mono">
                          {formatDate(content.createdAt)}
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/contents/${content.id}`);
                          }}
                          className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-200 group-hover:bg-zinc-800"
                        >
                          View Details
                        </Button>
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
