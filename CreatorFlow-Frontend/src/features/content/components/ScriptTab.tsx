import { useState } from 'react';
import { Copy, Check, FileText, Clock, Volume2 } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui';
import { notify } from '@/stores/notificationStore';
import { padSceneNumber } from '@/lib/utils';
import type { Storyboard, Content } from '@/types';

interface ScriptTabProps {
  content: Content;
  storyboard: Storyboard | null;
}

export function ScriptTab({ content, storyboard }: ScriptTabProps) {
  const [copied, setCopied] = useState(false);

  if (!storyboard || storyboard.scenes.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No Script Available"
        description="The script has not been generated for this content item yet."
      />
    );
  }

  const scenes = storyboard.scenes;
  const fullNarration = scenes.map((s) => s.narration).join('\n\n');
  const totalWords = fullNarration.trim().split(/\s+/).filter(Boolean).length;
  // Standard speaking rate is ~140-160 words per minute
  const estSpeakingSec = Math.round((totalWords / 150) * 60);

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(fullNarration);
      setCopied(true);
      notify.success('Full script copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify.error('Failed to copy script');
    }
  };

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Script Metrics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-300">
          <div className="flex items-center gap-1.5 font-medium text-zinc-200">
            <Volume2 className="h-4 w-4 text-brand-400" />
            <span>Audio & Voice Script</span>
          </div>
          <div className="h-4 w-px bg-zinc-700 hidden sm:block" />
          <div className="flex items-center gap-1 text-zinc-400">
            <span>Total Words:</span>
            <strong className="text-zinc-200 font-mono">{totalWords}</strong>
          </div>
          <div className="h-4 w-px bg-zinc-700 hidden sm:block" />
          <div className="flex items-center gap-1 text-zinc-400">
            <Clock className="h-3.5 w-3.5" />
            <span>Est. Speech Time:</span>
            <strong className="text-zinc-200 font-mono">~{estSpeakingSec}s</strong>
          </div>
          <div className="h-4 w-px bg-zinc-700 hidden sm:block" />
          <div className="flex items-center gap-1 text-zinc-400">
            <span>Language:</span>
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300 uppercase">
              {content.language}
            </span>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleCopyScript()}
          className="text-xs border-zinc-700 hover:bg-zinc-800"
        >
          {copied ? (
            <>
              <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-400" />
              Script Copied
            </>
          ) : (
            <>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy Full Script
            </>
          )}
        </Button>
      </div>

      {/* Editorial Script View */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-6">
        {scenes.map((scene) => (
          <div
            key={scene.id}
            className="flex gap-4 group pb-4 border-b border-zinc-800/40 last:border-0 last:pb-0"
          >
            <div className="shrink-0 pt-0.5">
              <span className="inline-flex items-center rounded bg-zinc-800/80 px-2 py-0.5 font-mono text-[11px] font-semibold text-zinc-400 border border-zinc-700/50 group-hover:text-brand-300 group-hover:border-brand-700 transition-colors">
                [{padSceneNumber(scene.sceneNumber)}]
              </span>
            </div>
            <div className="space-y-1 flex-1">
              <p className="text-sm text-zinc-200 leading-relaxed font-sans">
                {scene.narration}
              </p>
              <div className="text-[11px] text-zinc-500 font-mono">
                Duration: {scene.durationSec}s • Visual: {scene.visualType}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
