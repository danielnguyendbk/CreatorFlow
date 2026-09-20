import { useState } from 'react';
import {
  Calendar,
  Share2,
  RefreshCw,
  AlertCircle,
  Copy,
  Check,
} from 'lucide-react';
import { Button, StatusBadge, EmptyState } from '@/components/ui';
import { publicationStatusConfig } from '@/utils/statusConfig';
import { formatDateTime, formatRelative } from '@/lib/utils';
import { publicationApi } from '@/api';
import { notify } from '@/stores/notificationStore';
import { useQueryClient } from '@tanstack/react-query';
import { useContentPublications } from '../useContent';
import type { Content, Platform } from '@/types';

interface PublicationTabProps {
  content: Content;
}

const PLATFORM_LABELS: Record<Platform, { label: string; color: string }> = {
  YOUTUBE_SHORTS: { label: 'YouTube Shorts', color: 'bg-red-500/10 text-red-400 border-red-500/30' },
  TIKTOK: { label: 'TikTok', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  INSTAGRAM_REELS: { label: 'Instagram Reels', color: 'bg-pink-500/10 text-pink-400 border-pink-500/30' },
  FACEBOOK_REELS: { label: 'Facebook Reels', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
};

export function PublicationTab({ content }: PublicationTabProps) {
  const qc = useQueryClient();
  const { data: publications, isLoading } = useContentPublications(content.id);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-32 rounded-xl border border-zinc-800 bg-zinc-900/40 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!publications || publications.length === 0) {
    return (
      <EmptyState
        icon={Share2}
        title="No Publication Targets"
        description="Distribution targets (YouTube Shorts, TikTok, Instagram) will be configured once the final render is ready."
      />
    );
  }

  const handleRetry = async (pubId: string) => {
    setRetryingId(pubId);
    try {
      await publicationApi.retryPublication(pubId);
      void qc.invalidateQueries({ queryKey: ['publications'] });
      notify.success('Publication retrying', 'Post will be dispatched to platform API.');
    } catch (err) {
      notify.error('Retry failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setRetryingId(null);
    }
  };

  const handleCopyCaption = async (id: string, caption: string) => {
    try {
      await navigator.clipboard.writeText(caption);
      setCopiedId(id);
      notify.success('Caption copied to clipboard');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      notify.error('Failed to copy');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-zinc-400 pb-1">
        <span>Connected Distribution Channels ({publications.length})</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {publications.map((pub) => {
          const platformInfo = PLATFORM_LABELS[pub.platform] ?? {
            label: pub.platform,
            color: 'bg-zinc-800 text-zinc-300 border-zinc-700',
          };
          const meta = publicationStatusConfig[pub.status];

          return (
            <div
              key={pub.id}
              className="flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold ${platformInfo.color}`}
                    >
                      {platformInfo.label}
                    </span>
                    <StatusBadge meta={meta} size="sm" />
                  </div>
                  <h4 className="text-xs font-medium text-zinc-200 line-clamp-1">
                    {pub.title}
                  </h4>
                </div>

                {pub.status === 'FAILED' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleRetry(pub.id)}
                    isLoading={retryingId === pub.id}
                    className="text-xs border-red-800 text-red-300 hover:bg-red-950/40"
                  >
                    <RefreshCw className="mr-1 h-3 w-3" />
                    Retry
                  </Button>
                )}
              </div>

              {/* Caption Preview */}
              <div className="rounded-lg bg-zinc-950/70 p-3 text-xs text-zinc-300 border border-zinc-800/80 space-y-2">
                <p className="line-clamp-2 text-xs leading-relaxed">{pub.caption}</p>
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

              {/* Footer details */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 text-[11px] text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  {pub.scheduledAt ? (
                    <span>Scheduled: {formatDateTime(pub.scheduledAt)}</span>
                  ) : pub.publishedAt ? (
                    <span className="text-emerald-400">
                      Published {formatRelative(pub.publishedAt)}
                    </span>
                  ) : (
                    <span>Not scheduled</span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void handleCopyCaption(pub.id, pub.caption)}
                  className="inline-flex items-center gap-1 text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {copiedId === pub.id ? (
                    <>
                      <Check className="h-3 w-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>

              {pub.error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-900/40 bg-red-950/20 p-2.5 text-[11px] text-red-300">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
                  <span>{pub.error}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
