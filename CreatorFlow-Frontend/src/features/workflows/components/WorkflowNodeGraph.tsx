import {
  CheckCircle2,
  Clock,
  Hourglass,
  Loader2,
  XCircle,
  Cpu,
  UserCheck,
  Film,
  Volume2,
  FileText,
  Share2,
  ArrowRight,
} from 'lucide-react';
import { cn, formatMs } from '@/lib/utils';
import { nodeStatusConfig } from '@/utils/statusConfig';
import type { WorkflowNodeExecution } from '@/types';

interface WorkflowNodeGraphProps {
  nodes: WorkflowNodeExecution[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

const TYPE_ICONS: Record<string, typeof Cpu> = {
  AI_TASK: Cpu,
  TTS_TASK: Volume2,
  HUMAN_TASK: UserCheck,
  FFMPEG_TASK: Film,
  WHISPER_TASK: FileText,
  PLATFORM_TASK: Share2,
};

export function WorkflowNodeGraph({
  nodes,
  selectedNodeId,
  onSelectNode,
}: WorkflowNodeGraphProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-zinc-100">DAG Execution Graph</h3>
          <p className="text-xs text-zinc-400">
            Directed Acyclic Graph of execution nodes. Click any node to inspect parameters & outputs.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-400">
          <span>Nodes:</span>
          <span className="font-mono text-zinc-200 font-semibold">{nodes.length}</span>
        </div>
      </div>

      {/* Nodes Stepper / Graph */}
      <div className="overflow-x-auto pb-3 pt-1">
        <div className="flex min-w-[800px] items-center">
          {nodes.map((node, index) => {
            const isSelected = selectedNodeId === node.id;
            const statusMeta = nodeStatusConfig[node.status];
            const isLast = index === nodes.length - 1;
            const TypeIcon = TYPE_ICONS[node.nodeType] ?? Cpu;

            return (
              <div key={node.id} className="flex items-center flex-1">
                {/* Node Box */}
                <button
                  type="button"
                  onClick={() => onSelectNode(node.id)}
                  className={cn(
                    'flex flex-col text-left rounded-xl border p-3 transition-all flex-1 max-w-[200px] relative group',
                    isSelected
                      ? 'border-brand-500 bg-brand-950/30 ring-2 ring-brand-500/50 shadow-lg shadow-brand-950/30'
                      : 'border-zinc-800 bg-zinc-950/70 hover:border-zinc-700 hover:bg-zinc-900/80',
                    node.status === 'FAILED' && !isSelected && 'border-red-900/60 bg-red-950/20',
                    node.status === 'WAITING' && !isSelected && 'border-amber-700/60 bg-amber-950/20',
                  )}
                >
                  {/* Top line: icon & status */}
                  <div className="flex items-center justify-between gap-1 w-full mb-2">
                    <div
                      className={cn(
                        'flex h-7 w-7 items-center justify-center rounded-lg ring-1',
                        node.status === 'COMPLETED' && 'bg-emerald-950/70 text-emerald-400 ring-emerald-800/60',
                        node.status === 'RUNNING' && 'bg-blue-950/70 text-blue-400 ring-blue-800/60',
                        node.status === 'WAITING' && 'bg-amber-950/70 text-amber-400 ring-amber-800/60 animate-pulse',
                        node.status === 'FAILED' && 'bg-red-950/70 text-red-400 ring-red-800/60',
                        node.status === 'PENDING' && 'bg-zinc-900 text-zinc-500 ring-zinc-800',
                      )}
                    >
                      {node.status === 'COMPLETED' ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : node.status === 'RUNNING' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : node.status === 'WAITING' ? (
                        <Hourglass className="h-4 w-4" />
                      ) : node.status === 'FAILED' ? (
                        <XCircle className="h-4 w-4" />
                      ) : (
                        <Clock className="h-4 w-4" />
                      )}
                    </div>

                    <span
                      className={cn(
                        'text-[10px] font-mono font-semibold uppercase px-1.5 py-0.5 rounded',
                        node.status === 'COMPLETED' && 'bg-emerald-950 text-emerald-400',
                        node.status === 'RUNNING' && 'bg-blue-950 text-blue-400',
                        node.status === 'WAITING' && 'bg-amber-950 text-amber-400',
                        node.status === 'FAILED' && 'bg-red-950 text-red-400',
                        node.status === 'PENDING' && 'bg-zinc-800 text-zinc-400',
                      )}
                    >
                      {statusMeta.label}
                    </span>
                  </div>

                  {/* Node Name */}
                  <div className="font-mono text-xs font-semibold text-zinc-200 line-clamp-1 group-hover:text-brand-300 transition-colors">
                    {node.nodeName}
                  </div>

                  {/* Node Type & Duration */}
                  <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-400 font-mono w-full">
                    <span className="flex items-center gap-1 text-zinc-400">
                      <TypeIcon className="h-3 w-3 text-zinc-400" />
                      {node.nodeType.replace('_TASK', '')}
                    </span>
                    {node.durationMs ? (
                      <span className="text-zinc-400">{formatMs(node.durationMs)}</span>
                    ) : node.retryCount > 0 ? (
                      <span className="text-red-400">retries: {node.retryCount}</span>
                    ) : null}
                  </div>
                </button>

                {/* Arrow Connector */}
                {!isLast && (
                  <div className="flex items-center justify-center px-2 shrink-0">
                    <ArrowRight
                      className={cn(
                        'h-4 w-4 transition-colors',
                        node.status === 'COMPLETED' ? 'text-emerald-500' : 'text-zinc-700',
                      )}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
