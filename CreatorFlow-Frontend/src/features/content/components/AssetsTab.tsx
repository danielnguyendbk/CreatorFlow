import { useState } from 'react';
import {
  FileVideo,
  FileAudio,
  FileImage,
  FileText,
  Copy,
  Check,
  FolderOpen,
  Film,
  ExternalLink,
} from 'lucide-react';
import { Badge, Button, EmptyState } from '@/components/ui';
import { formatBytes, formatDuration, formatRelative } from '@/lib/utils';
import { notify } from '@/stores/notificationStore';
import { useContentAssets } from '../useContent';
import type { Asset, AssetType } from '@/types';

interface AssetsTabProps {
  contentId: string;
}

const ASSET_ICONS: Record<AssetType, typeof FileVideo> = {
  VIDEO: FileVideo,
  FINAL_VIDEO: Film,
  IMAGE: FileImage,
  AUDIO: FileAudio,
  SUBTITLE: FileText,
};

export function AssetsTab({ contentId }: AssetsTabProps) {
  const { data: assets, isLoading } = useContentAssets(contentId);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-16 rounded-xl border border-zinc-800 bg-zinc-900/40 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!assets || assets.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="No Assets Uploaded Yet"
        description="Video clips, audio tracks, and final renders generated for this content will appear here."
      />
    );
  }

  const handleCopyUrl = async (asset: Asset) => {
    try {
      await navigator.clipboard.writeText(asset.url);
      setCopiedId(asset.id);
      notify.success('Asset URL copied to clipboard');
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      notify.error('Failed to copy URL');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-zinc-400 pb-1">
        <span>Attached Files ({assets.length})</span>
        <span>Storage: {formatBytes(assets.reduce((acc, a) => acc + a.fileSizeBytes, 0))}</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 font-medium">
            <tr>
              <th className="py-3 px-4">Asset Name</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Size</th>
              <th className="py-3 px-4">Duration</th>
              <th className="py-3 px-4">Uploaded</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
            {assets.map((asset) => {
              const Icon = ASSET_ICONS[asset.assetType] ?? FileVideo;
              return (
                <tr key={asset.id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 ring-1 ring-zinc-700/60 shrink-0">
                        <Icon className="h-4 w-4 text-brand-400" />
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

                  <td className="py-3 px-4 text-zinc-400">
                    {formatRelative(asset.createdAt)}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleCopyUrl(asset)}
                        className="h-7 px-2 text-zinc-400 hover:text-zinc-200"
                        title="Copy Asset URL"
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
                        title="Open Asset"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
