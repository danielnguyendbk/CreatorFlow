import { Link } from 'react-router-dom';
import {
  Lightbulb,
  FileText,
  Hourglass,
  Film,
  CheckCircle2,
  Calendar,
  XCircle,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { PageHeader, Card, CardContent, CardHeader, CardTitle, StatusBadge, LoadingScreen, ErrorState } from '@/components/ui';
import { useDashboardStats, useRecentContents } from './useDashboard';
import { contentStatusConfig } from '@/utils/statusConfig';
import { formatRelative } from '@/lib/utils';
import type { WorkflowStage } from '@/types';

// ─── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  iconColor: string;
  bgColor: string;
  href?: string;
}

function StatCard({ label, value, icon: Icon, iconColor, bgColor, href }: StatCardProps) {
  const inner = (
    <Card className="group cursor-pointer transition-colors hover:border-zinc-700">
      <CardContent className="flex items-center gap-4 p-5">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${bgColor}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums text-zinc-100">{value}</p>
          <p className="truncate text-xs text-zinc-500">{label}</p>
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return <Link to={href}>{inner}</Link>;
  }
  return inner;
}

// ─── Pipeline stage strip ─────────────────────────────────────────────────────

const PIPELINE_STAGES: { stage: WorkflowStage; label: string }[] = [
  { stage: 'IDEA', label: 'Idea' },
  { stage: 'SCRIPT', label: 'Script' },
  { stage: 'STORYBOARD', label: 'Storyboard' },
  { stage: 'VOICE', label: 'Voice' },
  { stage: 'VISUAL_ASSETS', label: 'Visuals' },
  { stage: 'RENDER', label: 'Render' },
  { stage: 'SUBTITLE', label: 'Subtitle' },
  { stage: 'PUBLICATION', label: 'Published' },
];

interface PipelineOverviewProps {
  stageCounts: Record<string, number>;
}

function PipelineOverview({ stageCounts }: PipelineOverviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline Overview</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5 pt-3">
        <div className="flex items-stretch gap-0 overflow-x-auto">
          {PIPELINE_STAGES.map((s, idx) => {
            const count = stageCounts[s.stage] ?? 0;
            const isLast = idx === PIPELINE_STAGES.length - 1;
            return (
              <div key={s.stage} className="flex items-center">
                <div className="flex min-w-[80px] flex-col items-center gap-1.5 px-2">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold tabular-nums
                      ${count > 0 ? 'bg-brand-600 text-white' : 'bg-zinc-800 text-zinc-600'}`}
                  >
                    {count}
                  </div>
                  <span className="text-center text-[10px] leading-tight text-zinc-500">{s.label}</span>
                </div>
                {!isLast && (
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-700" />
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ percent }: { percent: number }) {
  const color =
    percent === 100
      ? 'bg-emerald-500'
      : percent >= 60
      ? 'bg-brand-500'
      : percent >= 30
      ? 'bg-amber-500'
      : 'bg-zinc-600';

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="min-w-[2.5rem] text-right text-xs tabular-nums text-zinc-500">
        {percent}%
      </span>
    </div>
  );
}

// ─── Stage badge ──────────────────────────────────────────────────────────────

const stageLabelMap: Record<WorkflowStage, string> = {
  IDEA: 'Idea',
  SCRIPT: 'Script',
  STORYBOARD: 'Storyboard',
  VOICE: 'Voice',
  VISUAL_ASSETS: 'Visuals',
  RENDER: 'Render',
  SUBTITLE: 'Subtitle',
  PUBLICATION: 'Publication',
};

// ─── Dashboard page ───────────────────────────────────────────────────────────

export function DashboardPage() {
  const { data: stats, isLoading: statsLoading, error: statsError, refetch: refetchStats } = useDashboardStats();
  const { data: recent, isLoading: recentLoading, error: recentError, refetch: refetchRecent } = useRecentContents();

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Dashboard"
        description="Operational overview of your CreatorFlow pipeline"
        actions={
          <div className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 ring-1 ring-zinc-800">
            <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-xs text-zinc-400">All systems operational</span>
          </div>
        }
      />

      {/* Stats row */}
      {statsLoading ? (
        <LoadingScreen message="Loading stats…" />
      ) : statsError ? (
        <ErrorState message="Could not load dashboard stats" onRetry={refetchStats} />
      ) : stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          <StatCard
            label="Today's Ideas"
            value={stats.todayIdeas}
            icon={Lightbulb}
            iconColor="text-indigo-400"
            bgColor="bg-indigo-950"
            href="/ideas"
          />
          <StatCard
            label="Scripts Ready"
            value={stats.scriptsReady}
            icon={FileText}
            iconColor="text-blue-400"
            bgColor="bg-blue-950"
            href="/contents"
          />
          <StatCard
            label="Need Flow Clips"
            value={stats.needFlowClips}
            icon={Hourglass}
            iconColor="text-amber-400"
            bgColor="bg-amber-950"
            href="/assets/inbox"
          />
          <StatCard
            label="Rendering"
            value={stats.rendering}
            icon={Film}
            iconColor="text-violet-400"
            bgColor="bg-violet-950"
            href="/render-queue"
          />
          <StatCard
            label="Ready to Publish"
            value={stats.readyToPublish}
            icon={CheckCircle2}
            iconColor="text-emerald-400"
            bgColor="bg-emerald-950"
            href="/publication-queue"
          />
          <StatCard
            label="Scheduled"
            value={stats.scheduled}
            icon={Calendar}
            iconColor="text-sky-400"
            bgColor="bg-sky-950"
            href="/publication-queue"
          />
          <StatCard
            label="Failed"
            value={stats.failed}
            icon={XCircle}
            iconColor="text-red-400"
            bgColor="bg-red-950"
          />
        </div>
      ) : null}

      {/* Pipeline overview */}
      {stats && <PipelineOverview stageCounts={stats.stageCounts} />}

      {/* Recent content */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Content</CardTitle>
            <Link
              to="/contents"
              className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {recentLoading ? (
            <LoadingScreen message="Loading recent content…" />
          ) : recentError ? (
            <ErrorState message="Could not load recent content" onRetry={refetchRecent} />
          ) : !recent || recent.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-600">No content yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" role="grid">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="px-5 py-3 text-left text-xs font-medium text-zinc-500">Title</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Stage</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Progress</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Updated</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {recent.map((content) => (
                    <tr
                      key={content.id}
                      className="group transition-colors hover:bg-zinc-800/30"
                    >
                      <td className="px-5 py-3">
                        <Link
                          to={`/contents/${content.id}`}
                          className="font-medium text-zinc-200 hover:text-white transition-colors group-hover:text-white line-clamp-1"
                        >
                          {content.title}
                        </Link>
                        <p className="mt-0.5 text-xs text-zinc-600 line-clamp-1">{content.niche}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-zinc-400">
                          {stageLabelMap[content.currentStage]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <ProgressBar percent={content.progressPercent} />
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-zinc-500">{formatRelative(content.updatedAt)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge meta={contentStatusConfig[content.status]} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
