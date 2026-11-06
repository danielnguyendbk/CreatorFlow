// ============================================================
// CreatorFlow — Domain Types
// All types are strict. No `any` allowed.
// ============================================================

// ------------------------------------------------------------
// Shared primitives
// ------------------------------------------------------------

export type ID = string;

export interface QuotaWindow {
  status: 'AVAILABLE' | 'NOT_AVAILABLE' | 'UNKNOWN';
  windowDurationMins: number;
  usedPercent?: number;
  remainingPercent?: number;
  resetsAt?: number | null;
  warning?: 'NORMAL' | 'LOW' | 'CRITICAL' | 'EXHAUSTED';
}
export interface CodexUsage {
  provider: 'CODEX_CLI'; agentId: string | null; source: string; freshness: 'LIVE' | 'STALE' | 'UNKNOWN';
  connection: string; errorCode: string | null; cliVersion: string | null; lastSynced: string | null; lastGoodAt: string | null;
  fiveHour: QuotaWindow; weekly: QuotaWindow; automationReadiness: string;
  refreshState: 'IDLE' | 'PENDING' | 'TIMEOUT';
  credits: { balance: string | null; hasCredits: boolean | null; unlimited: boolean | null } | null;
  tokens: { lifetimeTokens: number | null; peakDailyTokens: number | null } | null;
  thresholds: { low: number; critical: number };
}
export interface UsageHistoryEntry { id: string; sequence: number; observedAt: string; status: string; cliVersion: string | null; windows: {windowDurationMins: number; usedPercent: number}[] }

export type AgentTaskKind = 'GIT_FIXTURE' | 'FFMPEG_FIXTURE' | 'CAPABILITY_PROBE';
export type AgentCapability = AgentTaskKind | 'WORKTREE_PREPARE' | 'WORKTREE_INSPECT' | 'WORKTREE_CLEANUP' | 'CODING_PREFLIGHT';
export interface CodingRepository {
  id: string; agentId: string; canonicalPath: string; remoteUrl: string; allowedBases: string[]; protectedBranches: string[];
  enabled: boolean; verification: string; verifiedCommits: Record<string, string>; configHash: string; approvedBy: string; verifiedAt: string | null; errorCode: string | null;
}
export interface CodingWorkspace {
  id: string; repository_id: string; agent_id: string; base_ref: string; base_commit: string; branch: string; relative_path: string;
  state: string; current_task_id: string; owner_session: string | null; owner_attempt: number | null; lease_expires_at: string | null;
  writer_locked: boolean; last_checkpoint_id: string | null; cleanup_state: string; error_code: string | null; task_state?: string;
}
export interface CodingAdmissionResult { id: string; agent_id: string; state: string; reason: string; reserved_until: string | null; reserved_seconds: number; executionEnabled: false; budgetUnit: string }
export interface CodingInventory {
  executionEnabled: false; repositories: CodingRepository[]; workspaces: CodingWorkspace[];
  capabilities: { agentId: string; provider: string; installed: boolean; version: string | null; observedAt: string }[];
  policies: { id: string; agent_id: string; provider: string; enabled: boolean; operator_authorized: boolean; max_concurrent: number; max_reserved_seconds: number }[];
  admissions: CodingAdmissionResult[];
  events: { id: number; workspace_id: string | null; repository_id: string | null; type: string; actor: string; created_at: string }[];
}
export interface CredentialInventory {
  credentials: { agentId: string; name: string; generation: number; revokedAt: string | null; lastUsedAt: string | null }[];
  enrollment: { enabledUntil: string | null };
  audit: { agentId: string | null; generation: number | null; type: string; actor: string; createdAt: string }[];
  retention: { logsDays: number; temporaryWorktreeDays: number; artifactMetadataDays: number; preserveReferenced: boolean };
}
export interface CodingExecution {
  id: string; workspace_id: string; agent_id: string; state: string; contract_hash: string;
  contract: { baseCommit: string; checkpointId: string; repositoryId: string; repositoryConfigHash: string; agentId: string;
    task: { workspaceId: string; objective: string; allowedFiles: string[]; provider: string; budgetPolicyId: string; timeoutSec: number; maxAttempts: number } };
  authorization_id: string | null; session_id: string | null; attempt: number; lease_expires_at: string | null;
  checkpoint_id: string | null; error_code: string | null; diff: string | null; changed_files: string[] | null;
  diff_sha256: string | null; evidence_hash: string | null; updated_at: string;
}
export interface CodingExecutionInventory {
  executionEnabled: boolean; liveVerification: string; executions: CodingExecution[];
  capabilities: { agent_id: string; session_id: string; cli_version: string | null; protocol_supported: boolean; sandbox_verified: boolean; error_code: string | null; evidence_hash: string; observed_at: string }[];
  authorizations: { id: string; execution_id: string; operator_id: string; credential_generation: number; expires_at: string; revoked_at: string | null }[];
  events: { id: number; execution_id: string; type: string; actor: string; created_at: string }[];
}
export interface TaskCycle { id: string; state: string; tasks: {id: string; nodeKey: string; state: string}[] }
export interface LocalAgent {
  id: string;
  name: string;
  version: string;
  status: 'ONLINE' | 'OFFLINE';
  capabilities: AgentCapability[];
  lastHeartbeatAt: string | null;
  sessionId: string | null;
}
export interface AgentTask {
  id: string;
  agentId: string;
  kind: AgentCapability;
  state: 'QUEUED' | 'RUNNING' | 'CANCEL_REQUESTED' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
  attempt: number;
  maxAttempts: number;
  leaseExpiresAt: string | null;
  worktreeKey: string;
  timeoutSec: number;
  durationSec: number;
  errorCode: string | null;
  result: {
    exitCode: number;
    artifactSha256: string | null;
    bytes: number | null;
    gitCommit: string | null;
    gitAvailable: boolean | null;
    ffmpegAvailable: boolean | null;
    errorCode: string | null;
  } | null;
}
export interface AgentTaskEvent { id: number; attempt: number; type: string; createdAt: string }

export interface ProviderAccount {
  provider: string;
  displayName: string;
  installed: boolean;
  status: 'CONNECTED' | 'EXPIRED' | 'UNSUPPORTED' | 'UNKNOWN';
  healthCode: string;
  reconnectCapability: 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN';
  switchingCapability: 'SUPPORTED' | 'UNSUPPORTED' | 'UNKNOWN';
  checkedAt: string | null;
}

export interface ReconnectIntent {
  id: string;
  provider: string;
  status: string;
  command: string;
  instructions: string;
  documentationUrl: string;
}

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
  | 'RETRYING'
  | 'CANCELLED';

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
  supersededBy?: ID | null;
  reconciliationRequired?: boolean;
  failureCategory?: string | null;
  description?: string;
  connectionId?: string | null;
  visibility?: 'private' | 'unlisted' | 'public' | null;
  activeManifestId?: string | null;
}

export interface PublicationManifest {
  manifestId: string; schemaVersion: number; revision: number; publicationId: string;
  contentId: string; storyboardId: string; storyboardVersion: number; finalRenderJobId: string; finalVideoAssetId: string;
  fingerprint: string; createdAt: string; targetPlatform: Platform; connectionId: string; connectionRevision: string;
  visibility: 'private' | 'unlisted' | 'public'; intendedSchedule: string | null; evidenceId: string;
  media: { sha256: string; sizeBytes: number; durationMillis: number; container: string; codecs: { type: string; codec: string }[] };
  metadata: { title: string; caption: string; description: string; hashtags: string[]; providerDescription: string };
  providerSettings: { categoryId: string; selfDeclaredMadeForKids: boolean; notifySubscribers: boolean };
  artifactReferences: { assetId: string; sha256: string; sizeBytes: number; type: string }[];
  approval: { id: string; state: string; requiredOperator: string; issuedAt: string; expiresAt: string; decisionActor: string | null; decisionAt: string | null };
}
export interface PublicationReview {
  publicationId: string; activeManifestId: string | null; manifests: PublicationManifest[];
  readiness: { ready: boolean; reasons: string[]; realPublishEnabled: boolean; adapterMode: string; reconciliationRequired: boolean };
  renders: { id: string; outputAssetId: string; status: string; completedAt: string | null }[];
  connections: { id: string; platform: Platform; status: string; revision: string; revokedAt: string | null }[];
  audit: { id: string; manifestId: string | null; type: string; actor: string; createdAt: string }[];
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

export interface TelegramStatus {
  state: 'ENABLED' | 'DISABLED' | 'NOT_CONFIGURED';
  botToBot: string;
  bots: { identity: string; botId: number; configured: boolean; availability: string; nextOffset: number;
    lastPollAt: string | null; lastSuccessfulSendAt: string | null; errorCode: string | null }[];
  routes: { botIdentity: string; chatId: string; kind: 'CODE' | 'CONTENT' | 'VIDEO'; canControl: boolean; canApprove: boolean }[];
  operators: { botIdentity: string; chatId: string; userId: string; role: string }[];
  outbox: { state: string; count: number }[];
  errors: { id: string; refType: string; refId: string; state: string; errorCode: string; attempts: number }[];
}
export interface TelegramApproval {
  id: string; cycle_id: string; action: string; state: string; required_operator: number;
  bot_identity: string; chat_id: number; expires_at: string; decision_actor: number | null; decision_at: string | null; evidence_ref: string;
}
export interface TelegramRoutingTest {
  delivery: 'NOT_SENT';
  routes: { botIdentity: string; chatId: string; kind: string; operators: number }[];
}

export interface ApiResponse<T> {
  data: T;
  message: string | null;
  success: boolean;
}
