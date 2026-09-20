import { CheckCircle2, Clock, Hourglass, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { notify } from '@/stores/notificationStore';
import { useRetryStage } from '../useContent';
import type { Content, WorkflowStage, StageProgress } from '@/types';

const STAGES: { id: WorkflowStage; label: string }[] = [
  { id: 'IDEA', label: 'Idea' },
  { id: 'SCRIPT', label: 'Script' },
  { id: 'STORYBOARD', label: 'Storyboard' },
  { id: 'VOICE', label: 'Voice' },
  { id: 'VISUAL_ASSETS', label: 'Visual Assets' },
  { id: 'RENDER', label: 'Render' },
  { id: 'SUBTITLE', label: 'Subtitles' },
  { id: 'PUBLICATION', label: 'Publication' },
];

interface WorkflowTimelineProps {
  content: Content;
}

export function WorkflowTimeline({ content }: WorkflowTimelineProps) {
  const retryMutation = useRetryStage();

  const handleRetry = async (stage: WorkflowStage) => {
    try {
      await retryMutation.mutateAsync({ id: content.id, stage });
      notify.success(`Stage ${stage} retrying`, 'The workflow engine will resume execution.');
    } catch (err) {
      notify.error('Retry failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const getStageInfo = (stageId: WorkflowStage) => {
    const stageData = content.stages.find((s) => s.stage === stageId);
    const stageIndex = STAGES.findIndex((s) => s.id === stageId);
    const currentIndex = STAGES.findIndex((s) => s.id === content.currentStage);

    // Derived status
    let status: StageProgress['status'] = stageData?.status ?? 'PENDING';
    if (!stageData) {
      if (stageIndex < currentIndex) status = 'COMPLETED';
      else if (stageIndex === currentIndex) {
        status = content.status === 'FAILED' ? 'FAILED' : 'IN_PROGRESS';
      } else {
        status = 'PENDING';
      }
    }

    const isWaiting =
      stageId === 'VISUAL_ASSETS' && content.status === 'WAITING_FOR_ASSET';

    return { stageData, status, isWaiting, stageIndex, currentIndex };
  };

  const failedStage = content.stages.find((s) => s.status === 'FAILED');

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 mb-5">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">Workflow Pipeline</h3>
          <p className="text-xs text-zinc-400">
            End-to-end automated generation stages from initial concept to publication
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Current Stage:</span>
          <span className="inline-flex items-center rounded-md bg-brand-950/60 px-2 py-0.5 text-xs font-semibold text-brand-300 ring-1 ring-brand-800/50">
            {STAGES.find((s) => s.id === content.currentStage)?.label ?? content.currentStage}
          </span>
        </div>
      </div>

      {/* Visual Pipeline Horizontal Stepper */}
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-[760px] items-center justify-between">
          {STAGES.map((st, index) => {
            const { status, isWaiting } = getStageInfo(st.id);
            const isLast = index === STAGES.length - 1;

            return (
              <div key={st.id} className="flex flex-1 items-center">
                <div className="flex flex-col items-center group relative">
                  {/* Node Circle */}
                  <div
                    className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ring-2 transition-all',
                      status === 'COMPLETED' &&
                        'bg-emerald-950 text-emerald-300 ring-emerald-600',
                      isWaiting &&
                        'bg-amber-950 text-amber-300 ring-amber-500 animate-pulse ring-offset-2 ring-offset-zinc-900',
                      status === 'IN_PROGRESS' && !isWaiting &&
                        'bg-blue-950 text-blue-300 ring-blue-500 ring-offset-1 ring-offset-zinc-900',
                      status === 'FAILED' &&
                        'bg-red-950 text-red-300 ring-red-600 ring-offset-1 ring-offset-zinc-900',
                      status === 'PENDING' &&
                        'bg-zinc-800 text-zinc-500 ring-zinc-700',
                    )}
                  >
                    {status === 'COMPLETED' ? (
                      <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
                    ) : isWaiting ? (
                      <Hourglass className="h-4 w-4 text-amber-400" />
                    ) : status === 'IN_PROGRESS' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                    ) : status === 'FAILED' ? (
                      <XCircle className="h-4.5 w-4.5 text-red-400" />
                    ) : (
                      <Clock className="h-4 w-4 text-zinc-500" />
                    )}
                  </div>

                  {/* Stage Label */}
                  <span
                    className={cn(
                      'mt-2 text-xs font-medium text-center whitespace-nowrap',
                      status === 'COMPLETED' && 'text-emerald-400',
                      isWaiting && 'text-amber-400 font-semibold',
                      status === 'IN_PROGRESS' && !isWaiting && 'text-blue-400 font-semibold',
                      status === 'FAILED' && 'text-red-400 font-semibold',
                      status === 'PENDING' && 'text-zinc-500',
                    )}
                  >
                    {st.label}
                  </span>

                  {/* Subtext info */}
                  <span className="text-[10px] text-zinc-500 mt-0.5">
                    {isWaiting
                      ? 'Needs Assets'
                      : status === 'COMPLETED'
                      ? 'Done'
                      : status === 'IN_PROGRESS'
                      ? 'Running'
                      : status === 'FAILED'
                      ? 'Failed'
                      : 'Queued'}
                  </span>
                </div>

                {/* Connecting Line */}
                {!isLast && (
                  <div
                    className={cn(
                      'h-0.5 flex-1 mx-2 transition-colors',
                      status === 'COMPLETED' ? 'bg-emerald-600/70' : 'bg-zinc-800',
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Failure Callout if any stage failed */}
      {failedStage && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-xs">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
            <div>
              <span className="font-semibold text-red-300">
                Stage {failedStage.stage} Failed:{' '}
              </span>
              <span className="text-red-200 font-mono text-[11px]">
                {failedStage.error ?? 'Execution error encountered in stage.'}
              </span>
              {failedStage.retryCount > 0 && (
                <span className="ml-2 text-zinc-400">
                  (Retries: {failedStage.retryCount})
                </span>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleRetry(failedStage.stage)}
            isLoading={retryMutation.isPending}
            className="border-red-800 text-red-300 hover:bg-red-900/40"
          >
            <RefreshCw className="mr-1.5 h-3 w-3" />
            Retry Stage
          </Button>
        </div>
      )}
    </div>
  );
}
