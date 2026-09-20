import { useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Workflow,
  ArrowLeft,
  ExternalLink,
  RefreshCw,
  XCircle,
  Play,
  AlertCircle,
} from 'lucide-react';
import {
  Button,
  StatusBadge,
  Badge,
  LoadingScreen,
  ErrorState,
} from '@/components/ui';
import { workflowStatusConfig } from '@/utils/statusConfig';
import { formatMs, formatRelative } from '@/lib/utils';
import { notify } from '@/stores/notificationStore';
import {
  useWorkflow,
  useRetryWorkflow,
  useCancelWorkflow,
  useResumeWorkflowInstance,
} from './useWorkflows';
import { WorkflowNodeGraph } from './components/WorkflowNodeGraph';
import { NodeInspector } from './components/NodeInspector';
import { NodeHistoryTable } from './components/NodeHistoryTable';

export function WorkflowDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: workflow, isLoading, error, refetch } = useWorkflow(id);
  const retryMutation = useRetryWorkflow();
  const cancelMutation = useCancelWorkflow();
  const resumeMutation = useResumeWorkflowInstance();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Auto-select initial node (failed node > waiting node > running node > first node)
  const activeNodeId = useMemo(() => {
    if (selectedNodeId) return selectedNodeId;
    if (!workflow || workflow.nodes.length === 0) return null;

    const failed = workflow.nodes.find((n) => n.status === 'FAILED');
    if (failed) return failed.id;

    const waiting = workflow.nodes.find((n) => n.status === 'WAITING');
    if (waiting) return waiting.id;

    const running = workflow.nodes.find((n) => n.status === 'RUNNING');
    if (running) return running.id;

    return workflow.nodes[0].id;
  }, [selectedNodeId, workflow]);

  if (isLoading) {
    return <LoadingScreen message="Loading workflow execution instance..." />;
  }

  if (error || !workflow) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/workflows')}
            className="h-8 w-8 p-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold text-zinc-300">Workflow Instance Not Found</span>
        </div>
        <ErrorState
          title="Workflow not found"
          message={error instanceof Error ? error.message : `Unable to find workflow ID ${id}`}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const meta = workflowStatusConfig[workflow.status];
  const selectedNode = workflow.nodes.find((n) => n.id === activeNodeId) ?? null;

  const handleRetry = async () => {
    try {
      await retryMutation.mutateAsync(workflow.id);
      notify.success('Workflow Retrying', `Workflow ${workflow.id} queued for execution.`);
    } catch (err) {
      notify.error('Retry failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync(workflow.id);
      notify.info('Workflow Cancelled', `Workflow ${workflow.id} has been cancelled.`);
    } catch (err) {
      notify.error('Cancel failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const handleResume = async () => {
    try {
      await resumeMutation.mutateAsync(workflow.id);
      notify.success('Workflow Resumed', `Workflow ${workflow.id} is now running.`);
    } catch (err) {
      notify.error('Resume failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Breadcrumb Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/workflows')}
            className="h-8 w-8 p-0 border-zinc-700 text-zinc-400 hover:text-zinc-200"
            title="Back to Workflows"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
            <Link to="/workflows" className="hover:text-zinc-200 transition-colors">
              Workflows
            </Link>
            <span>/</span>
            <span className="text-zinc-200">{workflow.id}</span>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2">
          {workflow.status === 'FAILED' && (
            <Button
              variant="brand"
              size="sm"
              onClick={() => void handleRetry()}
              isLoading={retryMutation.isPending}
              className="text-xs"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Retry Workflow
            </Button>
          )}

          {workflow.status === 'RUNNING' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleCancel()}
              isLoading={cancelMutation.isPending}
              className="text-xs border-red-800 text-red-300 hover:bg-red-950/40"
            >
              <XCircle className="mr-1.5 h-3.5 w-3.5" />
              Cancel Workflow
            </Button>
          )}

          {workflow.status === 'WAITING' && (
            <Button
              variant="brand"
              size="sm"
              onClick={() => void handleResume()}
              isLoading={resumeMutation.isPending}
              className="text-xs"
            >
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Resume Execution
            </Button>
          )}

          <Link to={`/contents/${workflow.contentId}`}>
            <Button variant="outline" size="sm" className="text-xs border-zinc-700 hover:bg-zinc-800">
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              View Content
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Workflow Hero Header */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusBadge meta={meta} />
              <span className="font-mono text-xs text-zinc-400">ID: {workflow.id}</span>
              <span className="text-xs text-zinc-500">
                Started {formatRelative(workflow.startedAt || workflow.createdAt)}
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
              <Workflow className="h-6 w-6 text-brand-400" />
              <span>{workflow.contentTitle}</span>
            </h1>

            <div className="flex items-center gap-2 text-xs text-zinc-400 pt-1">
              <span>Target Content:</span>
              <Link
                to={`/contents/${workflow.contentId}`}
                className="font-mono text-brand-300 hover:underline"
              >
                {workflow.contentId}
              </Link>
              {workflow.currentNode && (
                <>
                  <span>•</span>
                  <span>Active Step:</span>
                  <Badge variant="outline" className="font-mono text-[11px]">
                    {workflow.currentNode}
                  </Badge>
                </>
              )}
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-3 gap-3 w-full lg:w-72 shrink-0">
            <div className="rounded-lg bg-zinc-950/60 p-2.5 border border-zinc-800 text-xs space-y-0.5">
              <div className="text-[11px] text-zinc-500">Nodes</div>
              <div className="font-mono text-base font-bold text-zinc-200">
                {workflow.nodes.filter((n) => n.status === 'COMPLETED').length}/{workflow.nodes.length}
              </div>
            </div>

            <div className="rounded-lg bg-zinc-950/60 p-2.5 border border-zinc-800 text-xs space-y-0.5">
              <div className="text-[11px] text-zinc-500">Duration</div>
              <div className="font-mono text-base font-bold text-zinc-200">
                {workflow.durationMs ? formatMs(workflow.durationMs) : '—'}
              </div>
            </div>

            <div className="rounded-lg bg-zinc-950/60 p-2.5 border border-zinc-800 text-xs space-y-0.5">
              <div className="text-[11px] text-zinc-500">Retries</div>
              <div className="font-mono text-base font-bold text-zinc-200">
                {workflow.retryCount}
              </div>
            </div>
          </div>
        </div>

        {/* Global error banner if failed */}
        {workflow.error && (
          <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3.5 text-xs text-red-300 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <div>
                <strong className="font-semibold text-red-200">Pipeline Execution Error: </strong>
                <span className="font-mono text-[11px] text-red-300">{workflow.error}</span>
              </div>
            </div>
            <Button
              variant="brand"
              size="sm"
              onClick={() => void handleRetry()}
              className="text-xs shrink-0"
            >
              <RefreshCw className="mr-1 h-3 w-3" />
              Retry Now
            </Button>
          </div>
        )}
      </div>

      {/* DAG Node Graph */}
      <WorkflowNodeGraph
        nodes={workflow.nodes}
        selectedNodeId={activeNodeId}
        onSelectNode={setSelectedNodeId}
      />

      {/* Selected Node Inspector */}
      <NodeInspector node={selectedNode} />

      {/* Node History Table */}
      <NodeHistoryTable
        nodes={workflow.nodes}
        selectedNodeId={activeNodeId}
        onSelectNode={setSelectedNodeId}
      />
    </div>
  );
}
