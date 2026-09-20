// ============================================================
// CreatorFlow — Domain Types
// All types are strict. No `any` allowed.
// ============================================================

// ------------------------------------------------------------
// Shared primitives
// ------------------------------------------------------------

export type ID = string;

export interface Timestamps {
  createdAt: string; // ISO 8601
  updatedAt: string;
}

// ------------------------------------------------------------
// Content Idea
// ------------------------------------------------------------

export type IdeaStatus = 'NEW' | 'SELECTED' | 'REJECTED' | 'CONVERTED';

export type ContentFormat =
  | 'SHORT_FORM'
  | 'LONG_FORM'
  | 'TUTORIAL'
  | 'EXPLAINER'
  | 'STORY'
  | 'COMPARISON';

export type ContentCategory =
  | 'JAVA_BACKEND'
  | 'SYSTEM_DESIGN'
  | 'AI_ENGINEERING'
  | 'DATABASE'
  | 'DEVOPS'
  | 'FRONTEND'
  | 'CLOUD'
  | 'CAREER'
  | 'OTHER';

export interface ContentIdea extends Timestamps {
  id: ID;
  title: string;
  hook: string;
  category: ContentCategory;
  format: ContentFormat;
  estimatedDurationSec: number;
  status: IdeaStatus;
  score: number | null; // 0–100 AI relevance score
  language: string; // e.g. "en", "vi"
  niche: string;
  notes: string | null;
}

// ------------------------------------------------------------
// Content
// ------------------------------------------------------------

export type ContentStatus =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'WAITING_FOR_ASSET'
  | 'RENDERING'
  | 'READY'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'FAILED';

export type WorkflowStage =
  | 'IDEA'
  | 'SCRIPT'
  | 'STORYBOARD'
  | 'VOICE'
  | 'VISUAL_ASSETS'
  | 'RENDER'
  | 'SUBTITLE'
  | 'PUBLICATION';

export interface StageProgress {
  stage: WorkflowStage;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  startedAt: string | null;
  completedAt: string | null;
  error: string | null;
  retryCount: number;
}

export interface Content extends Timestamps {
  id: ID;
  title: string;
  topic: string;
  status: ContentStatus;
  currentStage: WorkflowStage;
  progressPercent: number; // 0–100
  ideaId: ID | null;
  workflowInstanceId: ID | null;
  storyboardId: ID | null;
  scheduledPublicationAt: string | null;
  stages: StageProgress[];
  language: string;
  niche: string;
  tags: string[];
}

// ------------------------------------------------------------
// Storyboard & Scenes
// ------------------------------------------------------------

export type VisualType =
  | 'AI_VIDEO'
  | 'IMAGE'
  | 'DIAGRAM'
  | 'SCREENSHOT'
  | 'TEXT';

export type SceneAssetStatus =
  | 'NOT_STARTED'
  | 'WAITING_FOR_ASSET'
  | 'UPLOADING'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED';

export interface Scene {
  id: ID;
  storyboardId: ID;
  sceneNumber: number;
  durationSec: number;
  narration: string;
  visualType: VisualType;
  prompt: string;
  assetStatus: SceneAssetStatus;
  assetId: ID | null;
  notes: string | null;
}

export interface Storyboard extends Timestamps {
  id: ID;
  contentId: ID;
  title: string;
  totalDurationSec: number;
  scenes: Scene[];
  version: number;
}

// ------------------------------------------------------------
// Assets
// ------------------------------------------------------------

export type AssetType =
  | 'VIDEO'
  | 'IMAGE'
  | 'AUDIO'
  | 'SUBTITLE'
  | 'FINAL_VIDEO';

export interface Asset extends Timestamps {
  id: ID;
  filename: string;
  assetType: AssetType;
  contentId: ID | null;
  sceneId: ID | null;
  durationSec: number | null;
  fileSizeBytes: number;
  mimeType: string;
  thumbnailUrl: string | null;
  url: string;
  metadata: Record<string, string>;
}

// ------------------------------------------------------------
// Workflow
// ------------------------------------------------------------

export type WorkflowStatus =
  | 'CREATED'
  | 'RUNNING'
  | 'WAITING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type NodeStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED'
  | 'WAITING';

export interface WorkflowNodeExecution {
  id: ID;
  workflowInstanceId: ID;
  nodeName: string;
  nodeType: string;
  status: NodeStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  retryCount: number;
  input: Record<string, string> | null;
  output: Record<string, string> | null;
}

export interface WorkflowInstance extends Timestamps {
  id: ID;
  contentId: ID;
  contentTitle: string;
  status: WorkflowStatus;
  currentNode: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  retryCount: number;
  nodes: WorkflowNodeExecution[];
  error: string | null;
}

// ------------------------------------------------------------
// Render
// ------------------------------------------------------------

export type RenderStatus =
  | 'QUEUED'
  | 'RENDERING'
  | 'SUCCESS'
  | 'FAILED'
  | 'RETRYING';

export interface RenderJob extends Timestamps {
  id: ID;
  contentId: ID;
  contentTitle: string;
  status: RenderStatus;
  progressPercent: number; // 0–100
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  worker: string | null;
  retryCount: number;
  maxRetries: number;
  error: string | null;
  outputAssetId: ID | null;
  logs: string[];
}

// ------------------------------------------------------------
// Publication
// ------------------------------------------------------------

export type Platform =
  | 'YOUTUBE_SHORTS'
  | 'TIKTOK'
  | 'INSTAGRAM_REELS'
  | 'FACEBOOK_REELS';

export type PublicationStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED'
  | 'RETRYING';

export interface PublicationJob extends Timestamps {
  id: ID;
  contentId: ID;
  contentTitle: string;
  platform: Platform;
  status: PublicationStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  caption: string;
  title: string;
  hashtags: string[];
  attempts: number;
  maxAttempts: number;
  error: string | null;
  platformPostId: string | null;
}

// ------------------------------------------------------------
// Activity / System Events
// ------------------------------------------------------------

export type EventType =
  | 'CONTENT_CREATED'
  | 'SCRIPT_GENERATED'
  | 'STORYBOARD_GENERATED'
  | 'VOICE_GENERATED'
  | 'ASSET_UPLOADED'
  | 'ASSET_PROCESSING_STARTED'
  | 'ASSET_READY'
  | 'WORKFLOW_STARTED'
  | 'WORKFLOW_RESUMED'
  | 'WORKFLOW_PAUSED'
  | 'WORKFLOW_COMPLETED'
  | 'WORKFLOW_FAILED'
  | 'RENDER_STARTED'
  | 'RENDER_COMPLETED'
  | 'RENDER_FAILED'
  | 'PUBLICATION_SCHEDULED'
  | 'PUBLICATION_COMPLETED'
  | 'PUBLICATION_FAILED'
  | 'SYSTEM_ERROR';

export type EventSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export interface ActivityEvent {
  id: ID;
  timestamp: string; // ISO 8601
  type: EventType;
  entityId: ID | null;
  entityType: string | null;
  message: string;
  severity: EventSeverity;
  metadata: Record<string, string>;
}

// ------------------------------------------------------------
// Settings
// ------------------------------------------------------------

export type ProviderStatus = 'CONFIGURED' | 'NOT_CONFIGURED' | 'ERROR';

export interface AiProviderConfig {
  name: string;
  status: ProviderStatus;
  model: string | null;
  note: string | null;
}

export interface SystemSettings {
  general: {
    language: string;
    timezone: string;
  };
  contentDefaults: {
    defaultNiche: string;
    defaultLanguage: string;
    defaultFormat: ContentFormat;
    defaultDurationSec: number;
  };
  aiProviders: {
    gemini: AiProviderConfig;
    googleFlow: {
      mode: 'MANUAL' | 'AUTO';
      status: ProviderStatus;
    };
    localTts: {
      status: ProviderStatus;
      voice: string | null;
    };
  };
  media: {
    ffmpegStatus: ProviderStatus;
    outputDirectory: string;
    tempDirectory: string;
  };
  publishing: {
    youtube: ProviderStatus;
    tiktok: ProviderStatus;
    instagram: ProviderStatus;
    facebook: ProviderStatus;
  };
}

// ------------------------------------------------------------
// Pagination / API response wrappers
// ------------------------------------------------------------

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  data: T;
  message: string | null;
  success: boolean;
}
