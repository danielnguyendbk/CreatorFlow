import { useState, useEffect } from 'react';
import { FileVideo, CheckCircle2 } from 'lucide-react';
import { Modal, Button, Select } from '@/components/ui';
import { notify } from '@/stores/notificationStore';
import { formatBytes, formatDuration } from '@/lib/utils';
import { useContents, useStoryboard } from '@/features/content/useContent';
import { useAssignAssetToScene } from '../useAssets';
import type { Asset } from '@/types';

interface AssignSceneModalProps {
  open: boolean;
  onClose: () => void;
  asset: Asset | null;
  defaultContentId?: string;
  defaultSceneId?: string;
}

export function AssignSceneModal({
  open,
  onClose,
  asset,
  defaultContentId,
  defaultSceneId,
}: AssignSceneModalProps) {
  const { data: contents = [] } = useContents();
  const [selectedContentId, setSelectedContentId] = useState<string>(defaultContentId ?? '');
  const [selectedSceneId, setSelectedSceneId] = useState<string>(defaultSceneId ?? '');

  const { data: storyboard } = useStoryboard(selectedContentId);
  const assignMutation = useAssignAssetToScene();

  useEffect(() => {
    if (defaultContentId) setSelectedContentId(defaultContentId);
    if (defaultSceneId) setSelectedSceneId(defaultSceneId);
  }, [defaultContentId, defaultSceneId, open]);

  // If contents available and none selected, default to first or content-281
  useEffect(() => {
    if (!selectedContentId && contents.length > 0) {
      const redisContent = contents.find((c) => c.id === 'content-281');
      setSelectedContentId(redisContent ? redisContent.id : contents[0].id);
    }
  }, [contents, selectedContentId]);

  // When storyboard loads, pick first waiting scene or first scene
  useEffect(() => {
    if (storyboard && storyboard.scenes.length > 0 && !selectedSceneId) {
      const waitingScene = storyboard.scenes.find((s) => s.assetStatus === 'WAITING_FOR_ASSET');
      setSelectedSceneId(waitingScene ? waitingScene.id : storyboard.scenes[0].id);
    }
  }, [storyboard, selectedSceneId]);

  if (!asset) return null;

  const contentOptions = contents.map((c) => ({
    value: c.id,
    label: `${c.title} (${c.status})`,
  }));

  const sceneOptions = (storyboard?.scenes ?? []).map((s) => ({
    value: s.id,
    label: `Scene ${s.sceneNumber} (${s.durationSec}s) — ${s.assetStatus}`,
  }));

  const selectedScene = storyboard?.scenes.find((s) => s.id === selectedSceneId);

  const handleAssign = async () => {
    if (!selectedContentId || !selectedSceneId) return;

    try {
      await assignMutation.mutateAsync({
        assetId: asset.id,
        contentId: selectedContentId,
        sceneId: selectedSceneId,
        storyboardId: storyboard?.id,
      });

      notify.success(
        'Asset Assigned',
        `${asset.filename} attached to Scene ${selectedScene?.sceneNumber ?? ''}.`,
      );
      onClose();
    } catch (err) {
      notify.error('Assignment failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Assign Asset to Storyboard Scene"
      description="Connect this video clip or asset to a content pipeline."
      size="md"
    >
      <div className="space-y-4">
        {/* Asset Details Pill */}
        <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 text-brand-400 shrink-0">
            <FileVideo className="h-5 w-5" />
          </div>
          <div className="truncate flex-1">
            <div className="font-medium text-zinc-200 truncate">{asset.filename}</div>
            <div className="text-[11px] text-zinc-500 font-mono">
              {formatBytes(asset.fileSizeBytes)}
              {asset.durationSec ? ` • ${formatDuration(asset.durationSec)}` : ''}
              {asset.metadata.generator ? ` • ${asset.metadata.generator}` : ''}
            </div>
          </div>
        </div>

        {/* Content Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-300">Target Content</label>
          <Select
            options={contentOptions}
            value={selectedContentId}
            onChange={(e) => {
              setSelectedContentId(e.target.value);
              setSelectedSceneId('');
            }}
            className="text-xs"
          />
        </div>

        {/* Scene Selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-300">Target Scene</label>
          <Select
            options={sceneOptions}
            value={selectedSceneId}
            onChange={(e) => setSelectedSceneId(e.target.value)}
            disabled={!storyboard || sceneOptions.length === 0}
            className="text-xs"
          />
          {sceneOptions.length === 0 && (
            <p className="text-[11px] text-zinc-500 italic">
              Loading scenes or no storyboard available for selected content.
            </p>
          )}
        </div>

        {/* Scene Prompt Context Preview */}
        {selectedScene && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-zinc-300">
                Scene {selectedScene.sceneNumber} Context:
              </span>
              <span className="text-brand-400 font-mono">
                {selectedScene.assetStatus}
              </span>
            </div>
            <p className="font-mono text-[11px] text-zinc-400 bg-black/40 p-2 rounded border border-zinc-800/80">
              "{selectedScene.prompt}"
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={assignMutation.isPending}>
            Cancel
          </Button>
          <Button
            variant="brand"
            size="sm"
            onClick={() => void handleAssign()}
            disabled={!selectedContentId || !selectedSceneId || assignMutation.isPending}
            isLoading={assignMutation.isPending}
          >
            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            Confirm Assignment
          </Button>
        </div>
      </div>
    </Modal>
  );
}
