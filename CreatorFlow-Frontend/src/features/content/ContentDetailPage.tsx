import { useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Layers,
  FileText,
  FolderOpen,
  Film,
  Share2,
  Activity,
  ArrowLeft,
  ExternalLink,
  Play,
  Tag,
} from 'lucide-react';
import {
  PageHeader,
  Button,
  Badge,
  StatusBadge,
  LoadingScreen,
  ErrorState,
} from '@/components/ui';
import { contentStatusConfig } from '@/utils/statusConfig';
import { formatDate, formatRelative } from '@/lib/utils';
import { notify } from '@/stores/notificationStore';
import {
  useContent,
  useStoryboard,
  useContentAssets,
  useContentRenderJobs,
  useContentPublications,
  useContentActivity,
  useResumeWorkflow,
} from './useContent';
import { WorkflowTimeline } from './components/WorkflowTimeline';
import { WaitingForAssetBanner } from './components/WaitingForAssetBanner';
import { StoryboardTab } from './components/StoryboardTab';
import { ScriptTab } from './components/ScriptTab';
import { AssetsTab } from './components/AssetsTab';
import { RenderTab } from './components/RenderTab';
import { PublicationTab } from './components/PublicationTab';
import { ActivityTab } from './components/ActivityTab';

type ActiveTab = 'storyboard' | 'script' | 'assets' | 'render' | 'publication' | 'activity';

export function ContentDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ActiveTab>('storyboard');
  const storyboardRef = useRef<HTMLDivElement>(null);

  const { data: content, isLoading: isContentLoading, error: contentError, refetch } = useContent(id);
  const { data: storyboard, isLoading: isStoryboardLoading } = useStoryboard(id);
  const { data: assets } = useContentAssets(id);
  const { data: renders } = useContentRenderJobs(id);
  const { data: publications } = useContentPublications(id);
  const { data: activities } = useContentActivity(id);

  const resumeMutation = useResumeWorkflow();

  if (isContentLoading) {
    return <LoadingScreen message="Loading content workflow..." />;
  }

  if (contentError || !content) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Content Not Found"
          breadcrumbs={[
            { label: 'Contents', href: '/contents' },
            { label: id },
          ]}
        />
        <ErrorState
          title="Content item not found"
          message={contentError instanceof Error ? contentError.message : `Unable to find content with ID "${id}".`}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const statusMeta = contentStatusConfig[content.status];

  const handleResumeWorkflow = async () => {
    try {
      await resumeMutation.mutateAsync(content.id);
      notify.success('Workflow Resumed', 'Content has advanced to the Render stage.');
    } catch (err) {
      notify.error('Could not resume workflow', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const scrollToStoryboard = () => {
    setActiveTab('storyboard');
    storyboardRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const tabs = [
    {
      id: 'storyboard' as ActiveTab,
      label: 'Storyboard & Scenes',
      icon: Layers,
      count: storyboard?.scenes.length,
    },
    {
      id: 'script' as ActiveTab,
      label: 'Script',
      icon: FileText,
    },
    {
      id: 'assets' as ActiveTab,
      label: 'Assets',
      icon: FolderOpen,
      count: assets?.length,
    },
    {
      id: 'render' as ActiveTab,
      label: 'Render Job',
      icon: Film,
      count: renders?.length,
    },
    {
      id: 'publication' as ActiveTab,
      label: 'Publication',
      icon: Share2,
      count: publications?.length,
    },
    {
      id: 'activity' as ActiveTab,
      label: 'Activity',
      icon: Activity,
      count: activities?.length,
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      {/* Top Navigation & Breadcrumbs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/contents')}
            className="h-8 w-8 p-0 border-zinc-700 text-zinc-400 hover:text-zinc-200"
            title="Back to Contents"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2 text-xs text-zinc-400 font-mono">
            <Link to="/contents" className="hover:text-zinc-200 transition-colors">
              Contents
            </Link>
            <span>/</span>
            <span className="text-zinc-200 truncate max-w-xs">{content.title}</span>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2">
          {content.status === 'WAITING_FOR_ASSET' && (
            <Button
              variant="brand"
              size="sm"
              onClick={() => void handleResumeWorkflow()}
              isLoading={resumeMutation.isPending}
              className="text-xs"
            >
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Resume Pipeline
            </Button>
          )}

          {content.workflowInstanceId && (
            <Link to={`/workflows/${content.workflowInstanceId}`}>
              <Button variant="outline" size="sm" className="text-xs border-zinc-700 hover:bg-zinc-800">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                View Workflow
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Main Content Header Hero */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusBadge meta={statusMeta} />
              <Badge variant="outline" className="text-xs font-mono">
                {content.niche}
              </Badge>
              <Badge variant="secondary" className="text-xs uppercase font-mono">
                {content.language}
              </Badge>
              <span className="text-xs text-zinc-500">
                Created {formatDate(content.createdAt)} ({formatRelative(content.createdAt)})
              </span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100">
              {content.title}
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400">{content.topic}</p>

            {/* Tags */}
            {content.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <Tag className="h-3 w-3 text-zinc-500" />
                {content.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-zinc-800/80 px-2 py-0.5 text-[11px] font-mono text-zinc-400 border border-zinc-700/60"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Progress Card */}
          <div className="w-full lg:w-64 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 space-y-2 shrink-0">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-zinc-400">Total Completion</span>
              <span className="font-mono text-brand-400 font-bold">{content.progressPercent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className={`h-full transition-all duration-500 ease-out ${
                  content.status === 'FAILED'
                    ? 'bg-red-500'
                    : content.status === 'READY' || content.status === 'PUBLISHED'
                    ? 'bg-emerald-500'
                    : 'bg-brand-500'
                }`}
                style={{ width: `${content.progressPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
              <span>Stage: {content.currentStage}</span>
              {content.scheduledPublicationAt && (
                <span>Pub: {formatDate(content.scheduledPublicationAt)}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Workflow Stage Stepper */}
      <WorkflowTimeline content={content} />

      {/* Human-in-the-loop Callout Banner for Waiting Google Flow clips */}
      <div ref={storyboardRef}>
        <WaitingForAssetBanner
          content={content}
          storyboard={storyboard ?? null}
          onScrollToStoryboard={scrollToStoryboard}
        />
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-zinc-800">
        <div className="flex overflow-x-auto space-x-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`group inline-flex items-center gap-2 border-b-2 py-3 px-3 text-xs font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'border-brand-500 text-brand-300 font-semibold'
                    : 'border-transparent text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                }`}
              >
                <Icon
                  className={`h-4 w-4 transition-colors ${
                    isActive ? 'text-brand-400' : 'text-zinc-500 group-hover:text-zinc-400'
                  }`}
                />
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span
                    className={`ml-1 rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                      isActive
                        ? 'bg-brand-500/20 text-brand-300'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Tab Panel Content */}
      <div>
        {activeTab === 'storyboard' && (
          <StoryboardTab
            content={content}
            storyboard={storyboard ?? null}
            isLoading={isStoryboardLoading}
          />
        )}
        {activeTab === 'script' && (
          <ScriptTab content={content} storyboard={storyboard ?? null} />
        )}
        {activeTab === 'assets' && <AssetsTab contentId={content.id} />}
        {activeTab === 'render' && <RenderTab content={content} />}
        {activeTab === 'publication' && <PublicationTab content={content} />}
        {activeTab === 'activity' && <ActivityTab contentId={content.id} />}
      </div>
    </div>
  );
}
