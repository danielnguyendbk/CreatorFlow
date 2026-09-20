import { useState } from 'react';
import {
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  Upload,
  ArrowDown,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { notify } from '@/stores/notificationStore';
import { UploadClipModal } from './UploadClipModal';
import type { Content, Storyboard, Scene } from '@/types';

interface WaitingForAssetBannerProps {
  content: Content;
  storyboard: Storyboard | null;
  onScrollToStoryboard?: () => void;
}

export function WaitingForAssetBanner({
  content,
  storyboard,
  onScrollToStoryboard,
}: WaitingForAssetBannerProps) {
  const [copiedSceneId, setCopiedSceneId] = useState<string | null>(null);
  const [uploadScene, setUploadScene] = useState<Scene | null>(null);

  if (content.status !== 'WAITING_FOR_ASSET') return null;

  const pendingScenes =
    storyboard?.scenes.filter((s) => s.assetStatus === 'WAITING_FOR_ASSET') ?? [];

  const handleCopyPrompt = async (sceneId: string, prompt: string, sceneNumber: number) => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedSceneId(sceneId);
      notify.success(
        `Copied Scene ${sceneNumber} prompt`,
        'Ready to paste into Google Flow / VideoFX.',
      );
      setTimeout(() => setCopiedSceneId(null), 2000);
    } catch {
      notify.error('Could not copy to clipboard');
    }
  };

  return (
    <>
      <div className="relative overflow-hidden rounded-xl border border-amber-600/40 bg-gradient-to-r from-amber-950/40 via-amber-900/20 to-zinc-900/60 p-5 shadow-lg shadow-amber-950/20">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-amber-200">
                  Human-in-the-Loop Action Required: Video Clips Needed
                </h3>
                <p className="text-xs text-amber-300/80">
                  CreatorFlow has scripted and storyboxed this content, but requires{' '}
                  <span className="font-semibold text-amber-200">
                    {pendingScenes.length > 0
                      ? `${pendingScenes.length} Google Flow video clip${pendingScenes.length > 1 ? 's' : ''}`
                      : 'Google Flow video clips'}
                  </span>{' '}
                  to proceed to rendering.
                </p>
              </div>
            </div>

            {/* Workflow Steps */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1 text-xs">
              <div className="flex items-start gap-2 rounded-lg bg-black/30 p-2.5 border border-amber-800/30">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-300">
                  1
                </span>
                <span className="text-zinc-300">
                  <strong className="text-amber-200">Copy</strong> the AI visual prompt below
                </span>
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-black/30 p-2.5 border border-amber-800/30">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-300">
                  2
                </span>
                <span className="text-zinc-300">
                  <strong className="text-amber-200">Generate</strong> clip on Google Flow
                </span>
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-black/30 p-2.5 border border-amber-800/30">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-300">
                  3
                </span>
                <span className="text-zinc-300">
                  <strong className="text-amber-200">Download</strong> the generated MP4 clip
                </span>
              </div>
              <div className="flex items-start gap-2 rounded-lg bg-black/30 p-2.5 border border-amber-800/30">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[11px] font-bold text-amber-300">
                  4
                </span>
                <span className="text-zinc-300">
                  <strong className="text-amber-200">Upload</strong> clip here to resume pipeline
                </span>
              </div>
            </div>
          </div>

          {/* Quick Jump / Storyboard button */}
          <div className="flex flex-row sm:flex-col gap-2 shrink-0 justify-end">
            <a
              href="https://labs.google/flow"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-200 hover:bg-amber-500/20 transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Google Flow
            </a>
            {onScrollToStoryboard && (
              <Button
                variant="outline"
                size="sm"
                onClick={onScrollToStoryboard}
                className="text-xs border-zinc-700 hover:bg-zinc-800 text-zinc-300"
              >
                <ArrowDown className="mr-1.5 h-3.5 w-3.5" />
                View Storyboard
              </Button>
            )}
          </div>
        </div>

        {/* Pending Scenes Quick Cards */}
        {pendingScenes.length > 0 && (
          <div className="mt-4 border-t border-amber-800/30 pt-3">
            <div className="mb-2 text-xs font-medium text-amber-300/90 flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Pending Scenes Awaiting Video Clips ({pendingScenes.length}):
            </div>
            <div className="space-y-2">
              {pendingScenes.map((scene) => (
                <div
                  key={scene.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-zinc-800/90 bg-zinc-950/70 p-3"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[11px] font-mono font-semibold text-amber-300">
                        Scene {scene.sceneNumber}
                      </span>
                      <span className="text-[11px] text-zinc-400">
                        {scene.durationSec}s • {scene.visualType}
                      </span>
                    </div>
                    <p className="font-mono text-xs text-zinc-300 bg-zinc-900/80 rounded px-2 py-1 border border-zinc-800">
                      "{scene.prompt}"
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleCopyPrompt(scene.id, scene.prompt, scene.sceneNumber)}
                      className="text-xs border-zinc-700 hover:bg-zinc-800"
                    >
                      {copiedSceneId === scene.id ? (
                        <>
                          <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-400" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="mr-1.5 h-3.5 w-3.5" />
                          Copy Prompt
                        </>
                      )}
                    </Button>
                    <Button
                      variant="brand"
                      size="sm"
                      onClick={() => setUploadScene(scene)}
                      className="text-xs"
                    >
                      <Upload className="mr-1.5 h-3.5 w-3.5" />
                      Upload Clip
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Upload Clip Modal */}
      {storyboard && (
        <UploadClipModal
          isOpen={Boolean(uploadScene)}
          onClose={() => setUploadScene(null)}
          contentId={content.id}
          storyboardId={storyboard.id}
          scene={uploadScene}
        />
      )}
    </>
  );
}
