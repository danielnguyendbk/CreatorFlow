import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Inbox,
  Sparkles,
  ExternalLink,
  UploadCloud,
  FileVideo,
  Copy,
  Check,
  CheckCircle2,
  Hourglass,
  Layers,
  ArrowRight,
  Trash2,
  Loader2,
} from 'lucide-react';
import {
  Button,
  Badge,
} from '@/components/ui';
import { formatBytes, formatDuration } from '@/lib/utils';
import { notify } from '@/stores/notificationStore';
import {
  useInboxAssets,
  usePendingFlowScenes,
  useUploadInboxAsset,
  useAssignAssetToScene,
  useDeleteAsset,
} from './useAssets';
import { AssignSceneModal } from './components/AssignSceneModal';
import type { Asset } from '@/types';

export function AssetInboxPage() {
  const { data: inboxAssets = [], isLoading: isInboxLoading } = useInboxAssets();
  const { data: pendingScenes = [], isLoading: isPendingLoading } = usePendingFlowScenes();

  const uploadMutation = useUploadInboxAsset();
  const assignMutation = useAssignAssetToScene();
  const deleteMutation = useDeleteAsset();

  const [copiedSceneId, setCopiedSceneId] = useState<string | null>(null);
  const [selectedAssetForAssign, setSelectedAssetForAssign] = useState<Asset | null>(null);
  const [targetContentId, setTargetContentId] = useState<string | undefined>(undefined);
  const [targetSceneId, setTargetSceneId] = useState<string | undefined>(undefined);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleCopyPrompt = async (sceneId: string, prompt: string, num: number) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedSceneId(sceneId);
      notify.success(`Scene ${num} prompt copied`, 'Ready to paste into Google Flow.');
      setTimeout(() => setCopiedSceneId(null), 2000);
    } catch {
      notify.error('Failed to copy');
    }
  };

  const handleFileDrop = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadMutation.mutateAsync({
        file,
        metadata: { generator: 'Google Flow' },
        onProgress: (pct) => setUploadProgress(pct),
      });

      notify.success('Clip added to Inbox', `${file.name} is ready to be assigned to a scene.`);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      notify.error('Upload failed', err instanceof Error ? err.message : 'Unknown error');
      setUploadProgress(0);
    }
  };

  // Quick auto-match helper
  const findSuggestedMatch = (asset: Asset) => {
    // E.g. ram -> scene-001-02, structures -> scene-001-04
    const name = asset.filename.toLowerCase();
    for (const group of pendingScenes) {
      for (const scene of group.scenes) {
        const prompt = scene.prompt.toLowerCase();
        if (
          (name.includes('ram') && prompt.includes('ram')) ||
          (name.includes('structure') && prompt.includes('structure')) ||
          (name.includes('kafka') && prompt.includes('kafka'))
        ) {
          return { contentId: group.contentId, contentTitle: group.contentTitle, scene };
        }
      }
    }
    return null;
  };

  const handleQuickMatch = async (
    asset: Asset,
    contentId: string,
    sceneId: string,
    sceneNumber: number,
  ) => {
    try {
      await assignMutation.mutateAsync({
        assetId: asset.id,
        contentId,
        sceneId,
        storyboardId: 'sb-001', // for content-281
      });

      notify.success(
        'Quick Match Successful',
        `Attached ${asset.filename} to Scene ${sceneNumber}.`,
      );
    } catch (err) {
      notify.error('Match failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteMutation.mutateAsync(id);
      notify.success('Removed from Inbox', name);
    } catch {
      notify.error('Failed to delete asset');
    }
  };

  const totalPendingScenesCount = pendingScenes.reduce(
    (acc, group) => acc + group.scenes.length,
    0,
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono mb-1">
            <Link to="/assets" className="hover:text-zinc-200 transition-colors">
              Assets
            </Link>
            <span>/</span>
            <span className="text-zinc-200">Flow Inbox</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 sm:text-2xl">
            Flow Asset Inbox
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400">
            Triage newly downloaded clips from Google Flow and assign them to scenes awaiting assets
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href="https://labs.google/flow"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-500/20 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open Google Flow
          </a>
        </div>
      </div>

      {/* Section 1: Scenes Awaiting Google Flow Clips */}
      <div className="rounded-xl border border-amber-600/40 bg-gradient-to-r from-amber-950/20 via-zinc-900/60 to-zinc-900/60 p-5 shadow-lg shadow-amber-950/10 space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30">
              <Hourglass className="h-4 w-4 animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">
                Scenes Awaiting Video Clips ({totalPendingScenesCount})
              </h2>
              <p className="text-xs text-zinc-400">
                Generate clips on Google Flow with these prompts, then drop the downloaded MP4 below
              </p>
            </div>
          </div>

          <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 font-mono text-xs font-semibold text-amber-300">
            Stage 5: Visual Assets
          </span>
        </div>

        {isPendingLoading ? (
          <div className="h-32 rounded-lg bg-zinc-900/40 animate-pulse" />
        ) : pendingScenes.length === 0 ? (
          <div className="rounded-lg bg-zinc-950/40 p-4 text-center text-xs text-zinc-400">
            No scenes are currently waiting for Google Flow assets.
          </div>
        ) : (
          <div className="space-y-4">
            {pendingScenes.map((group) => (
              <div key={group.contentId} className="space-y-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-400 font-medium">Content:</span>
                  <Link
                    to={`/contents/${group.contentId}`}
                    className="font-semibold text-brand-300 hover:underline"
                  >
                    {group.contentTitle}
                  </Link>
                  <span className="text-zinc-500 font-mono text-[11px]">
                    ({group.contentId})
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {group.scenes.map((scene) => (
                    <div
                      key={scene.sceneId}
                      className="flex flex-col justify-between rounded-lg border border-zinc-800 bg-zinc-950/70 p-3.5 space-y-3"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-xs font-bold text-amber-300">
                            Scene {scene.sceneNumber}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              void handleCopyPrompt(scene.sceneId, scene.prompt, scene.sceneNumber)
                            }
                            className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors"
                          >
                            {copiedSceneId === scene.sceneId ? (
                              <>
                                <Check className="h-3 w-3 text-emerald-400" />
                                <span className="text-emerald-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                <span>Copy Prompt</span>
                              </>
                            )}
                          </button>
                        </div>
                        <p className="font-mono text-xs text-zinc-300 bg-zinc-900/90 p-2.5 rounded border border-zinc-800 line-clamp-3 select-all">
                          "{scene.prompt}"
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-[11px]">
                        <span className="text-amber-400 font-medium">Pending asset</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setTargetContentId(group.contentId);
                            setTargetSceneId(scene.sceneId);
                            if (inboxAssets.length > 0) {
                              setSelectedAssetForAssign(inboxAssets[0]);
                            } else {
                              fileInputRef.current?.click();
                            }
                          }}
                          className="h-7 px-2 text-xs border-zinc-700 hover:bg-zinc-800"
                        >
                          <Layers className="mr-1 h-3 w-3 text-brand-400" />
                          Assign Clip
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 2: Inbox Dropzone & Unassigned Assets */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-100">
              Unassigned Inbox Assets ({inboxAssets.length})
            </h2>
            <Badge variant="outline" className="text-[11px]">
              Triage Queue
            </Badge>
          </div>

          <Button
            variant="brand"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs"
          >
            <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
            Drop Google Flow Clip
          </Button>
        </div>

        {/* Hidden File Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,.mp4,.webm,.mov"
          className="hidden"
          onChange={handleFileDrop}
        />

        {/* Upload Progress Strip */}
        {uploadMutation.isPending && (
          <div className="rounded-lg border border-brand-500/30 bg-brand-950/30 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-brand-300">
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Uploading downloaded clip to inbox...
              </span>
              <span className="font-mono">{uploadProgress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-brand-500 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Loading State or Dropzone Banner if empty */}
        {isInboxLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-36 rounded-xl border border-zinc-800 bg-zinc-900/40 animate-pulse"
              />
            ))}
          </div>
        ) : inboxAssets.length === 0 && !uploadMutation.isPending ? (
          <div
            onClick={() => fileInputRef.current?.click()}
            className="group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/30 p-10 text-center transition-colors hover:border-brand-500 hover:bg-zinc-900/60"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 group-hover:bg-brand-500/10 group-hover:text-brand-400">
              <Inbox className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-zinc-200">
              Inbox Zero! No unassigned clips
            </h3>
            <p className="mt-1 text-xs text-zinc-500 max-w-sm">
              When you download generated video clips from Google Flow, drop them here to quickly match and attach them to scenes.
            </p>
          </div>
        ) : (
          /* Cards of Inbox Assets */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {inboxAssets.map((asset) => {
              const suggested = findSuggestedMatch(asset);

              return (
                <div
                  key={asset.id}
                  className="flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 hover:border-zinc-700 transition-all space-y-3"
                >
                  <div className="space-y-2">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 text-brand-400 shrink-0">
                          <FileVideo className="h-4 w-4" />
                        </div>
                        <div className="truncate">
                          <h4 className="text-xs font-semibold text-zinc-200 truncate">
                            {asset.filename}
                          </h4>
                          <div className="text-[11px] text-zinc-500 font-mono">
                            {formatBytes(asset.fileSizeBytes)}
                            {asset.durationSec ? ` • ${formatDuration(asset.durationSec)}` : ''}
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleDelete(asset.id, asset.filename)}
                        className="h-7 w-7 p-0 text-zinc-500 hover:text-red-400"
                        title="Delete from inbox"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Metadata generator */}
                    {asset.metadata.promptTag && (
                      <div className="rounded bg-black/40 p-2 text-[11px] font-mono text-zinc-400 border border-zinc-800 line-clamp-2">
                        "{asset.metadata.promptTag}"
                      </div>
                    )}

                    {/* Smart Match Pill if suggested */}
                    {suggested && (
                      <div className="rounded-lg border border-emerald-800/40 bg-emerald-950/20 p-2 text-[11px] text-emerald-300 flex items-center justify-between">
                        <span className="flex items-center gap-1 font-medium truncate">
                          <Sparkles className="h-3 w-3 shrink-0" />
                          Suggested: {suggested.contentTitle} (Scene {suggested.scene.sceneNumber})
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800/60">
                    {suggested && (
                      <Button
                        variant="brand"
                        size="sm"
                        onClick={() =>
                          void handleQuickMatch(
                            asset,
                            suggested.contentId,
                            suggested.scene.sceneId,
                            suggested.scene.sceneNumber,
                          )
                        }
                        isLoading={assignMutation.isPending}
                        className="text-xs h-7 px-2.5"
                      >
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Quick Match
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedAssetForAssign(asset);
                        setTargetContentId(undefined);
                        setTargetSceneId(undefined);
                      }}
                      className="text-xs h-7 px-2.5 border-zinc-700 hover:bg-zinc-800"
                    >
                      <ArrowRight className="mr-1 h-3 w-3" />
                      Assign...
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Assign Modal */}
      <AssignSceneModal
        open={Boolean(selectedAssetForAssign)}
        onClose={() => {
          setSelectedAssetForAssign(null);
          setTargetContentId(undefined);
          setTargetSceneId(undefined);
        }}
        asset={selectedAssetForAssign}
        defaultContentId={targetContentId}
        defaultSceneId={targetSceneId}
      />
    </div>
  );
}
