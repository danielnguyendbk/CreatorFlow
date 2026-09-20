import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Send,
  Calendar,
  RefreshCw,
  Search,
  Edit2,
  AlertCircle,
  Globe,
  X,
} from 'lucide-react';
import {
  Button,
  StatusBadge,
  Select,
  EmptyState,
  ErrorState,
} from '@/components/ui';
import { publicationStatusConfig } from '@/utils/statusConfig';
import { formatDateTime, formatRelative } from '@/lib/utils';
import { notify } from '@/stores/notificationStore';
import { usePublications, useRetryPublication, usePublishNow } from './usePublishing';
import { EditPublicationModal } from './components/EditPublicationModal';
import type { PublicationJob, Platform } from '@/types';

const PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Platforms' },
  { value: 'YOUTUBE_SHORTS', label: 'YouTube Shorts' },
  { value: 'TIKTOK', label: 'TikTok' },
  { value: 'INSTAGRAM_REELS', label: 'Instagram Reels' },
  { value: 'FACEBOOK_REELS', label: 'Facebook Reels' },
];

const PLATFORM_COLORS: Record<Platform, { label: string; badgeClass: string }> = {
  YOUTUBE_SHORTS: {
    label: 'YouTube Shorts',
    badgeClass: 'bg-red-950/60 text-red-300 border-red-800/50',
  },
  TIKTOK: {
    label: 'TikTok',
    badgeClass: 'bg-cyan-950/60 text-cyan-300 border-cyan-800/50',
  },
  INSTAGRAM_REELS: {
    label: 'Instagram Reels',
    badgeClass: 'bg-pink-950/60 text-pink-300 border-pink-800/50',
  },
  FACEBOOK_REELS: {
    label: 'Facebook Reels',
    badgeClass: 'bg-blue-950/60 text-blue-300 border-blue-800/50',
  },
};

type StatusTab = 'ALL' | 'SCHEDULED' | 'PUBLISHED' | 'FAILED';

export function PublicationQueuePage() {
  const { data: publications = [], isLoading, error, refetch } = usePublications();
  const retryMutation = useRetryPublication();
  const publishNowMutation = usePublishNow();

  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string>('ALL');
  const [statusTab, setStatusTab] = useState<StatusTab>('ALL');
  const [editingPublication, setEditingPublication] = useState<PublicationJob | null>(null);

  // Compute metrics
  const stats = useMemo(() => {
    return {
      total: publications.length,
      scheduled: publications.filter((p) => p.status === 'SCHEDULED').length,
      published: publications.filter((p) => p.status === 'PUBLISHED').length,
      failed: publications.filter((p) => p.status === 'FAILED').length,
    };
  }, [publications]);

  // Filter publications
  const filteredPublications = useMemo(() => {
    return publications.filter((pub) => {
      // Tab filter
      if (statusTab !== 'ALL' && pub.status !== statusTab) return false;

      // Platform filter
      if (platformFilter !== 'ALL' && pub.platform !== platformFilter) return false;

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchTitle = pub.title.toLowerCase().includes(q);
        const matchCaption = pub.caption.toLowerCase().includes(q);
        const matchContent = pub.contentTitle.toLowerCase().includes(q);
        const matchTag = pub.hashtags.some((h) => h.toLowerCase().includes(q));
        if (!matchTitle && !matchCaption && !matchContent && !matchTag) return false;
      }

      return true;
    });
  }, [publications, statusTab, platformFilter, search]);

  const handlePublishNow = async (id: string, platform: string) => {
    try {
      await publishNowMutation.mutateAsync(id);
      notify.success(
        'Published Successfully',
        `Dispatched to ${platform.replace(/_/g, ' ')}. Post is now live.`,
      );
    } catch (err) {
      notify.error('Publish failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await retryMutation.mutateAsync(id);
      notify.success('Publication Retrying', 'Post will be dispatched to platform API.');
    } catch {
      notify.error('Retry failed');
    }
  };

  const hasActiveFilters = search.trim() !== '' || platformFilter !== 'ALL' || statusTab !== 'ALL';

  const clearFilters = () => {
    setSearch('');
    setPlatformFilter('ALL');
    setStatusTab('ALL');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 sm:text-2xl">
            Publication Queue
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Multi-platform distribution schedule, social post metadata, and delivery verification
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

      {/* Summary Metrics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setStatusTab('ALL')}
          className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
            statusTab === 'ALL'
              ? 'border-brand-500 bg-brand-950/30 ring-1 ring-brand-500/30'
              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
          }`}
        >
          <span className="text-[11px] text-zinc-400 font-medium">All Posts</span>
          <span className="mt-1 font-mono text-xl font-bold text-zinc-100">{stats.total}</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusTab('SCHEDULED')}
          className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
            statusTab === 'SCHEDULED'
              ? 'border-sky-500 bg-sky-950/30 ring-1 ring-sky-500/30'
              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
          }`}
        >
          <span className="text-[11px] text-sky-400 font-medium flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Scheduled
          </span>
          <span className="mt-1 font-mono text-xl font-bold text-sky-300">{stats.scheduled}</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusTab('PUBLISHED')}
          className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
            statusTab === 'PUBLISHED'
              ? 'border-emerald-500 bg-emerald-950/30 ring-1 ring-emerald-500/30'
              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
          }`}
        >
          <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
            <Globe className="h-3 w-3" />
            Published Live
          </span>
          <span className="mt-1 font-mono text-xl font-bold text-emerald-300">{stats.published}</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusTab('FAILED')}
          className={`flex flex-col rounded-xl border p-3 text-left transition-all ${
            statusTab === 'FAILED'
              ? 'border-red-500 bg-red-950/30 ring-1 ring-red-500/30'
              : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
          }`}
        >
          <span className="text-[11px] text-red-400 font-medium flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Failed Attempts
          </span>
          <span className="mt-1 font-mono text-xl font-bold text-red-300">{stats.failed}</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by caption, post title, hashtags..."
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
              options={PLATFORM_OPTIONS}
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
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

      {/* Publications Cards Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-52 rounded-xl border border-zinc-800 bg-zinc-900/40 animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Failed to load publication queue"
          message={error instanceof Error ? error.message : 'Unknown error'}
          onRetry={() => void refetch()}
        />
      ) : filteredPublications.length === 0 ? (
        <EmptyState
          icon={Send}
          title="No Publications Found"
          description={
            hasActiveFilters
              ? 'No publication jobs match your selected filters.'
              : 'Completed videos scheduled for social channels will appear here.'
          }
          action={hasActiveFilters ? { label: 'Clear Filters', onClick: clearFilters } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPublications.map((pub) => {
            const platformInfo = PLATFORM_COLORS[pub.platform] ?? {
              label: pub.platform,
              badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-700',
            };
            const meta = publicationStatusConfig[pub.status];
            const isScheduled = pub.status === 'SCHEDULED';
            const isPublished = pub.status === 'PUBLISHED';
            const isFailed = pub.status === 'FAILED';

            return (
              <div
                key={pub.id}
                className="flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4 hover:border-zinc-700 transition-all"
              >
                {/* Card Top */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${platformInfo.badgeClass}`}
                        >
                          {platformInfo.label}
                        </span>
                        <StatusBadge meta={meta} size="sm" />
                      </div>
                      <h3 className="text-xs font-semibold text-zinc-100 line-clamp-1">
                        {pub.title}
                      </h3>
                      <div className="text-[11px] text-zinc-400 font-mono">
                        Target Content:{' '}
                        <Link
                          to={`/contents/${pub.contentId}`}
                          className="text-brand-300 hover:underline font-semibold"
                        >
                          {pub.contentTitle}
                        </Link>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingPublication(pub)}
                      className="h-7 w-7 p-0 text-zinc-400 hover:text-zinc-200"
                      title="Edit metadata"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Caption & Hashtags preview */}
                  <div className="rounded-lg bg-zinc-950/70 p-3 text-xs text-zinc-200 border border-zinc-800/80 space-y-2 select-text">
                    <p className="leading-relaxed text-xs">{pub.caption}</p>
                    {pub.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {pub.hashtags.map((h, i) => (
                          <span key={i} className="text-[11px] font-mono text-brand-400">
                            #{h}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Failure banner if error */}
                  {pub.error && (
                    <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-2.5 text-[11px] text-red-300 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                      <span>{pub.error}</span>
                    </div>
                  )}
                </div>

                {/* Card Footer Details & Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-800/70 text-xs">
                  <div className="flex items-center gap-1.5 text-zinc-400 font-mono text-[11px]">
                    <Calendar className="h-3.5 w-3.5 text-zinc-500" />
                    {isPublished && pub.publishedAt ? (
                      <span className="text-emerald-400">
                        Published {formatRelative(pub.publishedAt)}
                      </span>
                    ) : pub.scheduledAt ? (
                      <span>Scheduled: {formatDateTime(pub.scheduledAt)}</span>
                    ) : (
                      <span>Not scheduled</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isScheduled && (
                      <Button
                        variant="brand"
                        size="sm"
                        onClick={() => void handlePublishNow(pub.id, pub.platform)}
                        isLoading={publishNowMutation.isPending}
                        className="text-xs h-7 px-2.5"
                      >
                        <Send className="mr-1 h-3 w-3" />
                        Publish Now
                      </Button>
                    )}

                    {isFailed && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleRetry(pub.id)}
                        isLoading={retryMutation.isPending}
                        className="text-xs h-7 px-2.5 border-red-800 text-red-300 hover:bg-red-950/30"
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Retry
                      </Button>
                    )}

                    {isPublished && pub.platformPostId && (
                      <span className="font-mono text-[11px] text-zinc-500">
                        Post ID: {pub.platformPostId}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Modal */}
      <EditPublicationModal
        open={Boolean(editingPublication)}
        onClose={() => setEditingPublication(null)}
        publication={editingPublication}
      />
    </div>
  );
}
