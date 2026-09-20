import {
  AlertCircle,
  AlertTriangle,
  Archive,
  Calendar,
  CheckCircle2,
  Clock,
  Film,
  FileText,
  Globe,
  Hourglass,
  Loader2,
  PlayCircle,
  RefreshCw,
  SkipForward,
  Sparkles,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import type {
  ContentStatus,
  IdeaStatus,
  WorkflowStatus,
  RenderStatus,
  PublicationStatus,
  NodeStatus,
  SceneAssetStatus,
  EventSeverity,
  ProviderStatus,
} from '@/types';

export interface StatusMeta {
  label: string;
  icon: LucideIcon;
  /** Tailwind color token used for text/border/bg variants */
  color: 'zinc' | 'blue' | 'amber' | 'violet' | 'emerald' | 'sky' | 'green' | 'red' | 'orange' | 'purple' | 'indigo' | 'teal';
  /** Tailwind bg class for badge background */
  bgClass: string;
  /** Tailwind text class */
  textClass: string;
  /** Tailwind ring/border class */
  ringClass: string;
}

// -------------------------------------------------------
// Content Status
// -------------------------------------------------------
export const contentStatusConfig: Record<ContentStatus, StatusMeta> = {
  DRAFT: {
    label: 'Draft',
    icon: FileText,
    color: 'zinc',
    bgClass: 'bg-zinc-800',
    textClass: 'text-zinc-400',
    ringClass: 'ring-zinc-700',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    icon: Loader2,
    color: 'blue',
    bgClass: 'bg-blue-950',
    textClass: 'text-blue-400',
    ringClass: 'ring-blue-800',
  },
  WAITING_FOR_ASSET: {
    label: 'Waiting for Asset',
    icon: Hourglass,
    color: 'amber',
    bgClass: 'bg-amber-950',
    textClass: 'text-amber-400',
    ringClass: 'ring-amber-800',
  },
  RENDERING: {
    label: 'Rendering',
    icon: Film,
    color: 'violet',
    bgClass: 'bg-violet-950',
    textClass: 'text-violet-400',
    ringClass: 'ring-violet-800',
  },
  READY: {
    label: 'Ready',
    icon: CheckCircle2,
    color: 'emerald',
    bgClass: 'bg-emerald-950',
    textClass: 'text-emerald-400',
    ringClass: 'ring-emerald-800',
  },
  SCHEDULED: {
    label: 'Scheduled',
    icon: Calendar,
    color: 'sky',
    bgClass: 'bg-sky-950',
    textClass: 'text-sky-400',
    ringClass: 'ring-sky-800',
  },
  PUBLISHED: {
    label: 'Published',
    icon: Globe,
    color: 'green',
    bgClass: 'bg-green-950',
    textClass: 'text-green-400',
    ringClass: 'ring-green-800',
  },
  FAILED: {
    label: 'Failed',
    icon: XCircle,
    color: 'red',
    bgClass: 'bg-red-950',
    textClass: 'text-red-400',
    ringClass: 'ring-red-800',
  },
};

// -------------------------------------------------------
// Idea Status
// -------------------------------------------------------
export const ideaStatusConfig: Record<IdeaStatus, StatusMeta> = {
  NEW: {
    label: 'New',
    icon: Sparkles,
    color: 'indigo',
    bgClass: 'bg-indigo-950',
    textClass: 'text-indigo-400',
    ringClass: 'ring-indigo-800',
  },
  SELECTED: {
    label: 'Selected',
    icon: CheckCircle2,
    color: 'emerald',
    bgClass: 'bg-emerald-950',
    textClass: 'text-emerald-400',
    ringClass: 'ring-emerald-800',
  },
  REJECTED: {
    label: 'Rejected',
    icon: XCircle,
    color: 'zinc',
    bgClass: 'bg-zinc-800',
    textClass: 'text-zinc-500',
    ringClass: 'ring-zinc-700',
  },
  CONVERTED: {
    label: 'Converted',
    icon: PlayCircle,
    color: 'blue',
    bgClass: 'bg-blue-950',
    textClass: 'text-blue-400',
    ringClass: 'ring-blue-800',
  },
};

// -------------------------------------------------------
// Workflow Status
// -------------------------------------------------------
export const workflowStatusConfig: Record<WorkflowStatus, StatusMeta> = {
  CREATED: {
    label: 'Created',
    icon: FileText,
    color: 'zinc',
    bgClass: 'bg-zinc-800',
    textClass: 'text-zinc-400',
    ringClass: 'ring-zinc-700',
  },
  RUNNING: {
    label: 'Running',
    icon: Loader2,
    color: 'blue',
    bgClass: 'bg-blue-950',
    textClass: 'text-blue-400',
    ringClass: 'ring-blue-800',
  },
  WAITING: {
    label: 'Waiting',
    icon: Clock,
    color: 'amber',
    bgClass: 'bg-amber-950',
    textClass: 'text-amber-400',
    ringClass: 'ring-amber-800',
  },
  COMPLETED: {
    label: 'Completed',
    icon: CheckCircle2,
    color: 'emerald',
    bgClass: 'bg-emerald-950',
    textClass: 'text-emerald-400',
    ringClass: 'ring-emerald-800',
  },
  FAILED: {
    label: 'Failed',
    icon: XCircle,
    color: 'red',
    bgClass: 'bg-red-950',
    textClass: 'text-red-400',
    ringClass: 'ring-red-800',
  },
  CANCELLED: {
    label: 'Cancelled',
    icon: Archive,
    color: 'zinc',
    bgClass: 'bg-zinc-800',
    textClass: 'text-zinc-500',
    ringClass: 'ring-zinc-700',
  },
};

// -------------------------------------------------------
// Node Status
// -------------------------------------------------------
export const nodeStatusConfig: Record<NodeStatus, StatusMeta> = {
  PENDING: {
    label: 'Pending',
    icon: Clock,
    color: 'zinc',
    bgClass: 'bg-zinc-800',
    textClass: 'text-zinc-500',
    ringClass: 'ring-zinc-700',
  },
  RUNNING: {
    label: 'Running',
    icon: Loader2,
    color: 'blue',
    bgClass: 'bg-blue-950',
    textClass: 'text-blue-400',
    ringClass: 'ring-blue-800',
  },
  COMPLETED: {
    label: 'Completed',
    icon: CheckCircle2,
    color: 'emerald',
    bgClass: 'bg-emerald-950',
    textClass: 'text-emerald-400',
    ringClass: 'ring-emerald-800',
  },
  FAILED: {
    label: 'Failed',
    icon: XCircle,
    color: 'red',
    bgClass: 'bg-red-950',
    textClass: 'text-red-400',
    ringClass: 'ring-red-800',
  },
  SKIPPED: {
    label: 'Skipped',
    icon: SkipForward,
    color: 'zinc',
    bgClass: 'bg-zinc-800',
    textClass: 'text-zinc-500',
    ringClass: 'ring-zinc-700',
  },
  WAITING: {
    label: 'Waiting',
    icon: Hourglass,
    color: 'amber',
    bgClass: 'bg-amber-950',
    textClass: 'text-amber-400',
    ringClass: 'ring-amber-800',
  },
};

// -------------------------------------------------------
// Render Status
// -------------------------------------------------------
export const renderStatusConfig: Record<RenderStatus, StatusMeta> = {
  QUEUED: {
    label: 'Queued',
    icon: Clock,
    color: 'zinc',
    bgClass: 'bg-zinc-800',
    textClass: 'text-zinc-400',
    ringClass: 'ring-zinc-700',
  },
  RENDERING: {
    label: 'Rendering',
    icon: Film,
    color: 'violet',
    bgClass: 'bg-violet-950',
    textClass: 'text-violet-400',
    ringClass: 'ring-violet-800',
  },
  SUCCESS: {
    label: 'Success',
    icon: CheckCircle2,
    color: 'emerald',
    bgClass: 'bg-emerald-950',
    textClass: 'text-emerald-400',
    ringClass: 'ring-emerald-800',
  },
  FAILED: {
    label: 'Failed',
    icon: XCircle,
    color: 'red',
    bgClass: 'bg-red-950',
    textClass: 'text-red-400',
    ringClass: 'ring-red-800',
  },
  RETRYING: {
    label: 'Retrying',
    icon: RefreshCw,
    color: 'orange',
    bgClass: 'bg-orange-950',
    textClass: 'text-orange-400',
    ringClass: 'ring-orange-800',
  },
};

// -------------------------------------------------------
// Publication Status
// -------------------------------------------------------
export const publicationStatusConfig: Record<PublicationStatus, StatusMeta> = {
  DRAFT: {
    label: 'Draft',
    icon: FileText,
    color: 'zinc',
    bgClass: 'bg-zinc-800',
    textClass: 'text-zinc-400',
    ringClass: 'ring-zinc-700',
  },
  SCHEDULED: {
    label: 'Scheduled',
    icon: Calendar,
    color: 'sky',
    bgClass: 'bg-sky-950',
    textClass: 'text-sky-400',
    ringClass: 'ring-sky-800',
  },
  PUBLISHING: {
    label: 'Publishing',
    icon: Loader2,
    color: 'blue',
    bgClass: 'bg-blue-950',
    textClass: 'text-blue-400',
    ringClass: 'ring-blue-800',
  },
  PUBLISHED: {
    label: 'Published',
    icon: Globe,
    color: 'green',
    bgClass: 'bg-green-950',
    textClass: 'text-green-400',
    ringClass: 'ring-green-800',
  },
  FAILED: {
    label: 'Failed',
    icon: XCircle,
    color: 'red',
    bgClass: 'bg-red-950',
    textClass: 'text-red-400',
    ringClass: 'ring-red-800',
  },
  RETRYING: {
    label: 'Retrying',
    icon: RefreshCw,
    color: 'orange',
    bgClass: 'bg-orange-950',
    textClass: 'text-orange-400',
    ringClass: 'ring-orange-800',
  },
};

// -------------------------------------------------------
// Scene Asset Status
// -------------------------------------------------------
export const sceneAssetStatusConfig: Record<SceneAssetStatus, StatusMeta> = {
  NOT_STARTED: {
    label: 'Not Started',
    icon: Clock,
    color: 'zinc',
    bgClass: 'bg-zinc-800',
    textClass: 'text-zinc-500',
    ringClass: 'ring-zinc-700',
  },
  WAITING_FOR_ASSET: {
    label: 'Waiting for Asset',
    icon: Hourglass,
    color: 'amber',
    bgClass: 'bg-amber-950',
    textClass: 'text-amber-400',
    ringClass: 'ring-amber-800',
  },
  UPLOADING: {
    label: 'Uploading',
    icon: Loader2,
    color: 'blue',
    bgClass: 'bg-blue-950',
    textClass: 'text-blue-400',
    ringClass: 'ring-blue-800',
  },
  PROCESSING: {
    label: 'Processing',
    icon: RefreshCw,
    color: 'violet',
    bgClass: 'bg-violet-950',
    textClass: 'text-violet-400',
    ringClass: 'ring-violet-800',
  },
  READY: {
    label: 'Ready',
    icon: CheckCircle2,
    color: 'emerald',
    bgClass: 'bg-emerald-950',
    textClass: 'text-emerald-400',
    ringClass: 'ring-emerald-800',
  },
  FAILED: {
    label: 'Failed',
    icon: AlertCircle,
    color: 'red',
    bgClass: 'bg-red-950',
    textClass: 'text-red-400',
    ringClass: 'ring-red-800',
  },
};

// -------------------------------------------------------
// Event Severity
// -------------------------------------------------------
export const severityConfig: Record<EventSeverity, StatusMeta> = {
  INFO: {
    label: 'Info',
    icon: AlertCircle,
    color: 'blue',
    bgClass: 'bg-blue-950',
    textClass: 'text-blue-400',
    ringClass: 'ring-blue-800',
  },
  SUCCESS: {
    label: 'Success',
    icon: CheckCircle2,
    color: 'emerald',
    bgClass: 'bg-emerald-950',
    textClass: 'text-emerald-400',
    ringClass: 'ring-emerald-800',
  },
  WARNING: {
    label: 'Warning',
    icon: AlertTriangle,
    color: 'amber',
    bgClass: 'bg-amber-950',
    textClass: 'text-amber-400',
    ringClass: 'ring-amber-800',
  },
  ERROR: {
    label: 'Error',
    icon: XCircle,
    color: 'red',
    bgClass: 'bg-red-950',
    textClass: 'text-red-400',
    ringClass: 'ring-red-800',
  },
};

// -------------------------------------------------------
// Provider Status
// -------------------------------------------------------
export const providerStatusConfig: Record<ProviderStatus, StatusMeta> = {
  CONFIGURED: {
    label: 'Configured',
    icon: CheckCircle2,
    color: 'emerald',
    bgClass: 'bg-emerald-950',
    textClass: 'text-emerald-400',
    ringClass: 'ring-emerald-800',
  },
  NOT_CONFIGURED: {
    label: 'Not Configured',
    icon: AlertCircle,
    color: 'zinc',
    bgClass: 'bg-zinc-800',
    textClass: 'text-zinc-400',
    ringClass: 'ring-zinc-700',
  },
  ERROR: {
    label: 'Error',
    icon: XCircle,
    color: 'red',
    bgClass: 'bg-red-950',
    textClass: 'text-red-400',
    ringClass: 'ring-red-800',
  },
};

