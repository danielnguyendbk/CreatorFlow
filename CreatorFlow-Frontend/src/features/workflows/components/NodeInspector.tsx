import {
  Cpu,
  Clock,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
} from 'lucide-react';
import { StatusBadge, Badge } from '@/components/ui';
import { nodeStatusConfig } from '@/utils/statusConfig';
import { formatDateTime, formatMs } from '@/lib/utils';
import type { WorkflowNodeExecution } from '@/types';

interface NodeInspectorProps {
  node: WorkflowNodeExecution | null;
}

export function NodeInspector({ node }: NodeInspectorProps) {
  if (!node) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center text-xs text-zinc-500">
        Select any execution node from the DAG graph above to inspect its runtime parameters.
      </div>
    );
  }

  const meta = nodeStatusConfig[node.status];

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-5">
      {/* Inspector Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <Cpu className="h-4 w-4 text-brand-400" />
            <h3 className="text-sm font-semibold font-mono text-zinc-100">{node.nodeName}</h3>
            <StatusBadge meta={meta} size="sm" />
          </div>
          <p className="text-xs text-zinc-400">
            Node ID: <span className="font-mono text-zinc-300">{node.id}</span> • Type:{' '}
            <Badge variant="outline" className="text-[10px] font-mono">
              {node.nodeType}
            </Badge>
          </p>
        </div>

        {/* Runtime stats */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-400 font-mono">
          {node.durationMs && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 text-zinc-500" />
              Duration: <strong className="text-zinc-200">{formatMs(node.durationMs)}</strong>
            </span>
          )}
          {node.retryCount > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <RefreshCw className="h-3.5 w-3.5" />
              Retries: {node.retryCount}
            </span>
          )}
        </div>
      </div>

      {/* Error Callout if node failed */}
      {node.error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3.5 text-xs text-red-300 space-y-1">
          <div className="flex items-center gap-2 font-semibold text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            Execution Error
          </div>
          <p className="font-mono text-[11px] text-red-200 bg-black/40 p-2.5 rounded border border-red-900/40">
            {node.error}
          </p>
        </div>
      )}

      {/* Execution Timeline Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="rounded-lg bg-zinc-950/60 p-2.5 border border-zinc-800/80">
          <div className="text-zinc-500 text-[11px]">Started At</div>
          <div className="font-medium text-zinc-200 mt-0.5">
            {node.startedAt ? formatDateTime(node.startedAt) : '—'}
          </div>
        </div>

        <div className="rounded-lg bg-zinc-950/60 p-2.5 border border-zinc-800/80">
          <div className="text-zinc-500 text-[11px]">Completed At</div>
          <div className="font-medium text-zinc-200 mt-0.5">
            {node.completedAt ? formatDateTime(node.completedAt) : '—'}
          </div>
        </div>

        <div className="rounded-lg bg-zinc-950/60 p-2.5 border border-zinc-800/80">
          <div className="text-zinc-500 text-[11px]">Status</div>
          <div className="font-medium text-zinc-200 mt-0.5">{node.status}</div>
        </div>

        <div className="rounded-lg bg-zinc-950/60 p-2.5 border border-zinc-800/80">
          <div className="text-zinc-500 text-[11px]">Duration</div>
          <div className="font-mono text-zinc-200 mt-0.5">
            {node.durationMs ? formatMs(node.durationMs) : 'In progress / Waiting'}
          </div>
        </div>
      </div>

      {/* Inputs and Outputs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
        {/* Input Parameters */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 font-medium text-zinc-300">
            <ArrowDownRight className="h-3.5 w-3.5 text-blue-400" />
            <span>Input Parameters</span>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-black/50 p-3 font-mono text-[11px] max-h-48 overflow-y-auto">
            {node.input && Object.keys(node.input).length > 0 ? (
              <pre className="text-zinc-300 whitespace-pre-wrap">
                {JSON.stringify(node.input, null, 2)}
              </pre>
            ) : (
              <span className="text-zinc-600 italic">No input parameters recorded.</span>
            )}
          </div>
        </div>

        {/* Output Results */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 font-medium text-zinc-300">
            <ArrowUpRight className="h-3.5 w-3.5 text-emerald-400" />
            <span>Output Results</span>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-black/50 p-3 font-mono text-[11px] max-h-48 overflow-y-auto">
            {node.output && Object.keys(node.output).length > 0 ? (
              <pre className="text-emerald-300 whitespace-pre-wrap">
                {JSON.stringify(node.output, null, 2)}
              </pre>
            ) : (
              <span className="text-zinc-600 italic">
                {node.status === 'COMPLETED'
                  ? 'Output verified (no payload).'
                  : 'Pending node completion.'}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
