import { useState } from 'react';
import {
  Copy,
  Check,
  Upload,
  Clock,
  Film,
  Sparkles,
  Layers,
  FileCheck,
  CheckCircle2,
} from 'lucide-react';
import { Button, StatusBadge, Badge, EmptyState } from '@/components/ui';
import { sceneAssetStatusConfig } from '@/utils/statusConfig';
import { formatDuration, padSceneNumber } from '@/lib/utils';
import { notify } from '@/stores/notificationStore';
import { UploadClipModal } from './UploadClipModal';
import type { Storyboard, Scene, Content } from '@/types';

interface StoryboardTabProps {
  content: Content;
  storyboard: Storyboard | null;
  isLoading: boolean;
}

export function StoryboardTab({ content, storyboard, isLoading }: StoryboardTabProps) {
  const [copiedSceneId, setCopiedSceneId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [uploadScene, setUploadScene] = useState<Scene | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-44 rounded-xl border border-zinc-800 bg-zinc-900/40 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!storyboard || storyboard.scenes.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No Storyboard Found"
        description="The storyboard generation stage has not completed yet for this content."
      />
    );
  }

  const scenes = storyboard.scenes;
  const readyCount = scenes.filter((s) => s.assetStatus === 'READY').length;
  const pendingCount = scenes.filter((s) => s.assetStatus === 'WAITING_FOR_ASSET').length;

  const handleCopyPrompt = async (sceneId: string, prompt: string, sceneNumber: number) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedSceneId(sceneId);
      notify.success(`Scene ${sceneNumber} prompt copied`);
      setTimeout(() => setCopiedSceneId(null), 2000);
    } catch {
      notify.error('Failed to copy to clipboard');
    }
  };

  const handleCopyAllPrompts = async () => {
    try {
      const allPrompts = scenes
        .map((s) => `[Scene ${s.sceneNumber} - ${s.durationSec}s]\n${s.prompt}`)
        .join('\n\n');
      await navigator.clipboard.writeText(allPrompts);
      setCopiedAll(true);
      notify.success('All scene prompts copied to clipboard');
      setTimeout(() => setCopiedAll(false), 2000);
    } catch {
      notify.error('Failed to copy prompts');
    }
  };

  return (
    <div className="space-y-5">
      {/* Storyboard Summary Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-300">
          <div className="flex items-center gap-1.5 font-medium text-zinc-200">
            <Film className="h-4 w-4 text-brand-400" />
            <span>{storyboard.title}</span>
          </div>
          <div className="h-4 w-px bg-zinc-700 hidden sm:block" />
          <div className="flex items-center gap-1 text-zinc-400">
            <Clock className="h-3.5 w-3.5" />
            <span>Total Duration:</span>
            <strong className="text-zinc-200 font-mono">
              {formatDuration(storyboard.totalDurationSec)} ({storyboard.totalDurationSec}s)
            </strong>
          </div>
          <div className="h-4 w-px bg-zinc-700 hidden sm:block" />
          <div className="flex items-center gap-2">
            <span>Assets:</span>
            <span className="inline-flex items-center gap-1 rounded bg-emerald-950/60 px-2 py-0.5 font-mono text-[11px] font-medium text-emerald-300 border border-emerald-800/40">
              <CheckCircle2 className="h-3 w-3" />
              {readyCount}/{scenes.length} Ready
            </span>
            {pendingCount > 0 && (
              <span className="inline-flex items-center rounded bg-amber-950/60 px-2 py-0.5 font-mono text-[11px] font-medium text-amber-300 border border-amber-800/40">
                {pendingCount} Needs Clips
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleCopyAllPrompts()}
            className="text-xs border-zinc-700 hover:bg-zinc-800"
          >
            {copiedAll ? (
              <>
                <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-400" />
                All Prompts Copied
              </>
            ) : (
              <>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copy All Prompts
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Scene Cards List */}
      <div className="space-y-4">
        {scenes.map((scene) => {
          const statusMeta = sceneAssetStatusConfig[scene.assetStatus];
          const isPending = scene.assetStatus === 'WAITING_FOR_ASSET';
          const isReady = scene.assetStatus === 'READY';

          return (
            <div
              key={scene.id}
              className={`rounded-xl border transition-all ${
                isPending
                  ? 'border-amber-700/60 bg-gradient-to-r from-amber-950/20 via-zinc-900/80 to-zinc-900/60 ring-1 ring-amber-500/20'
                  : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-700'
              } p-5`}
            >
              {/* Scene Card Header */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/70 pb-3 mb-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-7 items-center justify-center rounded-md bg-zinc-800 px-2 font-mono text-xs font-bold text-zinc-200 ring-1 ring-zinc-700">
                    SCENE {padSceneNumber(scene.sceneNumber)}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-zinc-400 font-mono">
                    <Clock className="h-3 w-3" />
                    {scene.durationSec}s
                  </span>
                  <Badge variant="outline" className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                    {scene.visualType.replace('_', ' ')}
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <StatusBadge meta={statusMeta} size="sm" />
                  {(isPending || scene.assetStatus === 'FAILED') && (
                    <Button
                      variant="brand"
                      size="sm"
                      onClick={() => setUploadScene(scene)}
                      className="text-xs h-7 px-2.5"
                    >
                      <Upload className="mr-1.5 h-3 w-3" />
                      Upload Clip
                    </Button>
                  )}
                  {isReady && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setUploadScene(scene)}
                      className="text-xs h-7 px-2 text-zinc-400 hover:text-zinc-200"
                    >
                      Replace Clip
                    </Button>
                  )}
                </div>
              </div>

              {/* Scene Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
                {/* Narration */}
                <div className="lg:col-span-6 space-y-1.5">
                  <div className="flex items-center justify-between text-zinc-400 font-medium text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <FileCheck className="h-3.5 w-3.5 text-zinc-500" />
                      Voice Narration
                    </span>
                  </div>
                  <div className="rounded-lg bg-zinc-950/70 p-3 text-zinc-200 border border-zinc-800/80 leading-relaxed font-sans text-xs italic">
                    "{scene.narration}"
                  </div>
                  {scene.notes && (
                    <p className="text-[11px] text-zinc-500 italic">
                      Note: {scene.notes}
                    </p>
                  )}
                </div>

                {/* Visual Prompt */}
                <div className="lg:col-span-6 space-y-1.5">
                  <div className="flex items-center justify-between text-zinc-400 font-medium text-[11px]">
                    <span className="flex items-center gap-1.5 text-brand-400">
                      <Sparkles className="h-3.5 w-3.5" />
                      Visual Generation Prompt
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleCopyPrompt(scene.id, scene.prompt, scene.sceneNumber)}
                      className="inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-brand-300 transition-colors"
                    >
                      {copiedSceneId === scene.id ? (
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
                  <div className="rounded-lg bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-zinc-300 border border-zinc-800/80 select-all">
                    {scene.prompt}
                  </div>
                  {isReady && scene.assetId && (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Asset attached ({scene.assetId})</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Upload Clip Modal */}
      <UploadClipModal
        isOpen={Boolean(uploadScene)}
        onClose={() => setUploadScene(null)}
        contentId={content.id}
        storyboardId={storyboard.id}
        scene={uploadScene}
      />
    </div>
  );
}
