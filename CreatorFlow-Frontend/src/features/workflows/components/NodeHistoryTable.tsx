import { Cpu } from 'lucide-react';
import { StatusBadge, Badge, Button } from '@/components/ui';
import { nodeStatusConfig } from '@/utils/statusConfig';
import { formatMs, formatRelative } from '@/lib/utils';
import type { WorkflowNodeExecution } from '@/types';

interface NodeHistoryTableProps {
  nodes: WorkflowNodeExecution[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}

export function NodeHistoryTable({
  nodes,
  selectedNodeId,
  onSelectNode,
}: NodeHistoryTableProps) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden space-y-0">
      <div className="border-b border-zinc-800 bg-zinc-950/60 px-4 py-3">
        <h3 className="text-xs font-semibold text-zinc-200">Execution Node History ({nodes.length})</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-zinc-800 bg-zinc-950/40 text-zinc-400 font-medium">
            <tr>
              <th className="py-2.5 px-4">Node Name</th>
              <th className="py-2.5 px-4">Type</th>
              <th className="py-2.5 px-4">Status</th>
              <th className="py-2.5 px-4">Duration</th>
              <th className="py-2.5 px-4">Retries</th>
              <th className="py-2.5 px-4">Started</th>
              <th className="py-2.5 px-4 text-right">Inspect</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
            {nodes.map((node) => {
              const meta = nodeStatusConfig[node.status];
              const isSelected = selectedNodeId === node.id;

              return (
                <tr
                  key={node.id}
                  onClick={() => onSelectNode(node.id)}
                  className={`cursor-pointer hover:bg-zinc-800/30 transition-colors ${
                    isSelected ? 'bg-brand-950/20 ring-1 ring-inset ring-brand-500/30' : ''
                  }`}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2 font-mono font-medium text-zinc-200">
                      <Cpu className="h-3.5 w-3.5 text-zinc-500" />
                      <span>{node.nodeName}</span>
                    </div>
                  </td>

                  <td className="py-3 px-4">
                    <Badge variant="outline" className="text-[10px] font-mono">
                      {node.nodeType}
                    </Badge>
                  </td>

                  <td className="py-3 px-4">
                    <StatusBadge meta={meta} size="sm" />
                  </td>

                  <td className="py-3 px-4 font-mono text-zinc-400">
                    {node.durationMs ? formatMs(node.durationMs) : '—'}
                  </td>

                  <td className="py-3 px-4 font-mono text-zinc-400">
                    {node.retryCount > 0 ? (
                      <span className="text-red-400 font-semibold">{node.retryCount}</span>
                    ) : (
                      '0'
                    )}
                  </td>

                  <td className="py-3 px-4 text-zinc-400">
                    {node.startedAt ? formatRelative(node.startedAt) : 'Pending'}
                  </td>

                  <td className="py-3 px-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectNode(node.id);
                      }}
                      className="h-6 px-2 text-[11px] text-zinc-400 hover:text-zinc-200"
                    >
                      {isSelected ? 'Selected' : 'View'}
                    </Button>
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
