import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FolderOpen,
  FileVideo,
  FileAudio,
  FileImage,
  FileText,
  Film,
  Search,
  Plus,
  Inbox,
  LayoutGrid,
  List,
  Copy,
  Check,
  ExternalLink,
  Trash2,
  HardDrive,
  Layers,
  X,
} from 'lucide-react';
import {
  Button,
  Badge,
  Select,
  EmptyState,
  ErrorState,
} from '@/components/ui';
import { formatBytes, formatDuration, formatRelative } from '@/lib/utils';
import { notify } from '@/stores/notificationStore';
import { useAssets, useDeleteAsset } from './useAssets';
import { UploadAssetModal } from './components/UploadAssetModal';
import { AssignSceneModal } from './components/AssignSceneModal';
import type { Asset, AssetType } from '@/types';

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Asset Types' },
  { value: 'VIDEO', label: 'Video Clips' },
  { value: 'FINAL_VIDEO', label: 'Final Renders' },
  { value: 'AUDIO', label: 'Audio & Voice' },
  { value: 'IMAGE', label: 'Images & Thumbs' },
  { value: 'SUBTITLE', label: 'Subtitles (.srt)' },
];

const ASSIGN_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL', label: 'All Assignments' },
  { value: 'ASSIGNED', label: 'Assigned to Content' },
  { value: 'UNASSIGNED', label: 'Unassigned (Inbox)' },
];

const ASSET_ICONS: Record<AssetType, typeof FileVideo> = {
  VIDEO: FileVideo,
  FINAL_VIDEO: Film,
  IMAGE: FileImage,
  AUDIO: FileAudio,
  SUBTITLE: FileText,
};

export function AssetLibraryPage() {
  const { data: assets = [], isLoading, error, refetch } = useAssets();
  const deleteMutation = useDeleteAsset();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [assignFilter, setAssignFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [assignAsset, setAssignAsset] = useState<Asset | null>(null);

  // Compute metrics
  const stats = useMemo(() => {
    const totalBytes = assets.reduce((sum, a) => sum + a.fileSizeBytes, 0);
    const videoClips = assets.filter((a) => a.assetType === 'VIDEO').length;
    const finalVideos = assets.filter((a) => a.assetType === 'FINAL_VIDEO').length;
    const audioSubs = assets.filter((a) => a.assetType === 'AUDIO' || a.assetType === 'SUBTITLE').length;
    const unassigned = assets.filter((a) => a.contentId === null).length;

    return {
      total: assets.length,
      storage: formatBytes(totalBytes),
      videoClips,
      finalVideos,
      audioSubs,
      unassigned,
    };
  }, [assets]);

  // Filter assets
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      // Type filter
      if (typeFilter !== 'ALL' && asset.assetType !== typeFilter) return false;

      // Assignment filter
      if (assignFilter === 'ASSIGNED' && asset.contentId === null) return false;
      if (assignFilter === 'UNASSIGNED' && asset.contentId !== null) return false;

      // Search filter
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = asset.filename.toLowerCase().includes(q);
        const matchType = asset.assetType.toLowerCase().includes(q);
        const matchContent = asset.contentId?.toLowerCase().includes(q);
        const matchMeta = Object.values(asset.metadata).some((v) =>
          v.toLowerCase().includes(q),
        );
        if (!matchName && !matchType && !matchContent && !matchMeta) return false;
      }

      return true;
    });
  }, [assets, typeFilter, assignFilter, search]);

  const handleCopyUrl = async (asset: Asset) => {
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopiedId(asset.id);
      notify.success('Asset URL copied');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      notify.error('Failed to copy URL');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      notify.success('Asset deleted', `${name} has been removed.`);
    } catch (err) {
      notify.error('Delete failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const hasActiveFilters = search.trim() !== '' || typeFilter !== 'ALL' || assignFilter !== 'ALL';

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('ALL');
    setAssignFilter('ALL');
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 sm:text-2xl">
            Asset Library
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Repository of all media clips, background tracks, subtitles, and final renders
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link to="/assets/inbox">
            <Button variant="outline" size="sm" className="text-xs border-zinc-700 hover:bg-zinc-800">
              <Inbox className="mr-1.5 h-3.5 w-3.5 text-amber-400" />
              Flow Inbox
              {stats.unassigned > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[10px] font-mono text-amber-300">
                  {stats.unassigned}
                </span>
              )}
            </Button>
          </Link>
          <Button variant="brand" size="sm" onClick={() => setIsUploadOpen(true)} className="text-xs">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Upload Asset
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 space-y-1">
          <span className="text-[11px] text-zinc-400 font-medium">Total Assets</span>
          <div className="font-mono text-xl font-bold text-zinc-100">{stats.total}</div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 space-y-1">
          <span className="text-[11px] text-blue-400 font-medium flex items-center gap-1">
            <HardDrive className="h-3 w-3" />
            Storage Used
          </span>
          <div className="font-mono text-xl font-bold text-blue-300">{stats.storage}</div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 space-y-1">
          <span className="text-[11px] text-zinc-400 font-medium">Video Clips</span>
          <div className="font-mono text-xl font-bold text-zinc-200">{stats.videoClips}</div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 space-y-1">
          <span className="text-[11px] text-emerald-400 font-medium">Final Renders</span>
          <div className="font-mono text-xl font-bold text-emerald-300">{stats.finalVideos}</div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 space-y-1">
          <span className="text-[11px] text-amber-400 font-medium">Unassigned Inbox</span>
          <div className="font-mono text-xl font-bold text-amber-300">{stats.unassigned}</div>
        </div>
      </div>

      {/* Filter and View Controls */}
      <div className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search by filename, type, or generator metadata..."
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
              options={TYPE_OPTIONS}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          <div className="w-44">
            <Select
              options={ASSIGN_OPTIONS}
              value={assignFilter}
              onChange={(e) => setAssignFilter(e.target.value)}
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

          {/* Grid vs Table View Mode */}
          <div className="flex items-center rounded-lg border border-zinc-700 bg-zinc-900 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                viewMode === 'grid'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                viewMode === 'table'
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Table View"
            >
              <List className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Asset Content View */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-44 rounded-xl border border-zinc-800 bg-zinc-900/40 animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <ErrorState
          title="Failed to load assets"
          message={error instanceof Error ? error.message : 'Unknown error'}
          onRetry={() => void refetch()}
        />
      ) : filteredAssets.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No Assets Found"
          description={
            hasActiveFilters
              ? 'No media assets match your active filters.'
              : 'Upload your first video clip or final render to populate the library.'
          }
          action={
            hasActiveFilters
              ? { label: 'Clear Filters', onClick: clearFilters }
              : { label: 'Upload Asset', onClick: () => setIsUploadOpen(true) }
          }
        />
      ) : viewMode === 'grid' ? (
        /* Grid Cards View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAssets.map((asset) => {
            const Icon = ASSET_ICONS[asset.assetType] ?? FileVideo;
            const isUnassigned = asset.contentId === null;

            return (
              <div
                key={asset.id}
                className="flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 hover:border-zinc-700 transition-all group"
              >
                <div className="space-y-3">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800 text-brand-400 ring-1 ring-zinc-700/60 shrink-0">
                      <Icon className="h-5 w-5" />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px] font-mono uppercase">
                        {asset.assetType.replace('_', ' ')}
                      </Badge>
                      {isUnassigned ? (
                        <span className="rounded bg-amber-950/60 px-1.5 py-0.5 font-mono text-[10px] font-medium text-amber-300 border border-amber-800/50">
                          Inbox
                        </span>
                      ) : (
                        <Link to={`/contents/${asset.contentId}`}>
                          <span className="rounded bg-brand-950/60 px-1.5 py-0.5 font-mono text-[10px] font-medium text-brand-300 border border-brand-800/40 hover:underline">
                            {asset.contentId}
                          </span>
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Title & Metadata */}
                  <div className="space-y-1">
                    <h3 className="text-xs font-semibold text-zinc-200 line-clamp-1 group-hover:text-brand-300 transition-colors">
                      {asset.filename}
                    </h3>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-400 font-mono">
                      <span>{formatBytes(asset.fileSizeBytes)}</span>
                      {asset.durationSec && (
                        <>
                          <span>•</span>
                          <span>{formatDuration(asset.durationSec)}</span>
                        </>
                      )}
                      <span>•</span>
                      <span>{formatRelative(asset.createdAt)}</span>
                    </div>
                  </div>

                  {/* Metadata tags if present */}
                  {asset.metadata.generator && (
                    <div className="text-[11px] text-zinc-500 font-mono">
                      Source: <span className="text-zinc-400">{asset.metadata.generator}</span>
                    </div>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="mt-4 flex items-center justify-between border-t border-zinc-800/70 pt-3">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleCopyUrl(asset)}
                      className="h-7 px-2 text-zinc-400 hover:text-zinc-200"
                      title="Copy URL"
                    >
                      {copiedId === asset.id ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <a
                      href={asset.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
                      title="Open file"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isUnassigned && (
                      <Button
                        variant="brand"
                        size="sm"
                        onClick={() => setAssignAsset(asset)}
                        className="h-7 px-2.5 text-xs"
                      >
                        <Layers className="mr-1 h-3 w-3" />
                        Assign
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void handleDelete(asset.id, asset.filename)}
                      className="h-7 px-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-950/20"
                      title="Delete asset"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-medium">
                <tr>
                  <th className="py-3 px-4">Filename</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Size</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Content Assignment</th>
                  <th className="py-3 px-4">Uploaded</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {filteredAssets.map((asset) => {
                  const Icon = ASSET_ICONS[asset.assetType] ?? FileVideo;
                  const isUnassigned = asset.contentId === null;

                  return (
                    <tr key={asset.id} className="hover:bg-zinc-800/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-brand-400 ring-1 ring-zinc-700/60 shrink-0">
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="truncate max-w-xs">
                            <div className="font-medium text-zinc-200 truncate">{asset.filename}</div>
                            <div className="text-[11px] text-zinc-500 font-mono">{asset.mimeType}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <Badge variant="outline" className="text-[11px]">
                          {asset.assetType.replace('_', ' ')}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 font-mono text-zinc-400">
                        {formatBytes(asset.fileSizeBytes)}
                      </td>

                      <td className="py-3 px-4 font-mono text-zinc-400">
                        {asset.durationSec ? formatDuration(asset.durationSec) : '—'}
                      </td>

                      <td className="py-3 px-4">
                        {isUnassigned ? (
                          <span className="rounded bg-amber-950/60 px-2 py-0.5 font-mono text-[11px] text-amber-300 border border-amber-800/50">
                            Unassigned (Inbox)
                          </span>
                        ) : (
                          <Link
                            to={`/contents/${asset.contentId}`}
                            className="font-mono text-[11px] text-brand-400 hover:underline"
                          >
                            {asset.contentId}
                          </Link>
                        )}
                      </td>

                      <td className="py-3 px-4 text-zinc-400">
                        {formatRelative(asset.createdAt)}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isUnassigned && (
                            <Button
                              variant="brand"
                              size="sm"
                              onClick={() => setAssignAsset(asset)}
                              className="h-7 px-2 text-xs"
                            >
                              Assign
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleCopyUrl(asset)}
                            className="h-7 px-2 text-zinc-400 hover:text-zinc-200"
                          >
                            {copiedId === asset.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void handleDelete(asset.id, asset.filename)}
                            className="h-7 px-1.5 text-zinc-500 hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

      {/* Modals */}
      <UploadAssetModal open={isUploadOpen} onClose={() => setIsUploadOpen(false)} />

      <AssignSceneModal
        open={Boolean(assignAsset)}
        onClose={() => setAssignAsset(null)}
        asset={assignAsset}
      />
    </div>
  );
}
