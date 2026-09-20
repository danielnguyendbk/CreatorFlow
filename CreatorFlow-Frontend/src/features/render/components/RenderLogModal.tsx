import { useState } from 'react';
import { Terminal, Copy, Check } from 'lucide-react';
import { Modal, Button } from '@/components/ui';
import { notify } from '@/stores/notificationStore';
import type { RenderJob } from '@/types';

interface RenderLogModalProps {
  open: boolean;
  onClose: () => void;
  job: RenderJob | null;
}

export function RenderLogModal({ open, onClose, job }: RenderLogModalProps) {
  const [copied, setCopied] = useState(false);

  if (!job) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(job.logs.join('\n'));
      setCopied(true);
      notify.success('Logs copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify.error('Failed to copy logs');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`FFmpeg Console Logs — ${job.id}`}
      description={`Render execution logs for "${job.contentTitle}"`}
      size="lg"
    >
      <div className="space-y-4">
        {/* Terminal Header */}
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-2 font-mono">
            <Terminal className="h-4 w-4 text-brand-400" />
            <span>Worker: {job.worker ?? 'worker-01'}</span>
            <span>•</span>
            <span>{job.logs.length} lines</span>
          </div>

          <Button variant="outline" size="sm" onClick={() => void handleCopy()} className="h-7 text-xs">
            {copied ? (
              <>
                <Check className="mr-1.5 h-3 w-3 text-emerald-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-1.5 h-3 w-3" />
                Copy All Logs
              </>
            )}
          </Button>
        </div>

        {/* Terminal Body */}
        <div className="rounded-xl border border-zinc-800 bg-black/95 p-4 font-mono text-xs text-zinc-300 max-h-96 overflow-y-auto space-y-1 select-text">
          {job.logs.length === 0 ? (
            <div className="text-zinc-600 italic">No logs generated yet.</div>
          ) : (
            job.logs.map((log, index) => {
              const isError = log.includes('ERROR') || log.includes('Invalid') || log.includes('code 1');
              const isSuccess = log.includes('complete') || log.includes('Output written');
              const isWarning = log.includes('WARN');

              return (
                <div
                  key={index}
                  className={`leading-relaxed text-[11px] ${
                    isError
                      ? 'text-red-400 font-semibold'
                      : isSuccess
                      ? 'text-emerald-400 font-semibold'
                      : isWarning
                      ? 'text-amber-400'
                      : 'text-zinc-400'
                  }`}
                >
                  {log}
                </div>
              );
            })
          )}
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
