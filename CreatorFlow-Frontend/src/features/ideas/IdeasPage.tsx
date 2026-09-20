import { useState, useMemo } from 'react';
import {
  Lightbulb,
  Sparkles,
  ChevronUp,
  ChevronDown,
  Play,
  X,
  Search,
  Clock,
} from 'lucide-react';
import {
  PageHeader,
  Button,
  Select,
  StatusBadge,
  LoadingScreen,
  ErrorState,
  EmptyState,
  Badge,
} from '@/components/ui';
import { useIdeas, useUpdateIdeaStatus } from './useIdeas';
import { GenerateIdeasModal } from './GenerateIdeasModal';
import { ideaStatusConfig } from '@/utils/statusConfig';
import { formatRelative, formatDuration } from '@/lib/utils';
import { notify } from '@/stores/notificationStore';
import type { ContentIdea, IdeaStatus, ContentCategory } from '@/types';

// ─── Category options ─────────────────────────────────────────────────────────

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All categories' },
  { value: 'JAVA_BACKEND', label: 'Java Backend' },
  { value: 'SYSTEM_DESIGN', label: 'System Design' },
  { value: 'AI_ENGINEERING', label: 'AI Engineering' },
  { value: 'DATABASE', label: 'Database' },
  { value: 'DEVOPS', label: 'DevOps' },
  { value: 'FRONTEND', label: 'Frontend' },
  { value: 'CLOUD', label: 'Cloud' },
  { value: 'OTHER', label: 'Other' },
];

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'NEW', label: 'New' },
  { value: 'SELECTED', label: 'Selected' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CONVERTED', label: 'Converted' },
];

const CATEGORY_LABELS: Record<ContentCategory, string> = {
  JAVA_BACKEND: 'Java Backend',
  SYSTEM_DESIGN: 'System Design',
  AI_ENGINEERING: 'AI Engineering',
  DATABASE: 'Database',
  DEVOPS: 'DevOps',
  FRONTEND: 'Frontend',
  CLOUD: 'Cloud',
  CAREER: 'Career',
  OTHER: 'Other',
};

// ─── Sort types ───────────────────────────────────────────────────────────────

type SortField = 'createdAt' | 'score' | 'estimatedDurationSec' | 'title';
type SortDir = 'asc' | 'desc';

function SortButton({
  field,
  label,
  current,
  dir,
  onSort,
}: {
  field: SortField;
  label: string;
  current: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
}) {
  const active = current === field;
  return (
    <button
      onClick={() => onSort(field)}
      className={`flex items-center gap-1 text-xs font-medium transition-colors ${
        active ? 'text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {label}
      {active ? (
        dir === 'desc' ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronUp className="h-3 w-3" />
        )
      ) : (
        <ChevronDown className="h-3 w-3 opacity-30" />
      )}
    </button>
  );
}

// ─── Idea row ─────────────────────────────────────────────────────────────────

interface IdeaRowProps {
  idea: ContentIdea;
  onSelect: (id: string) => void;
  onReject: (id: string) => void;
  isPending: boolean;
}

function IdeaRow({ idea, onSelect, onReject, isPending }: IdeaRowProps) {
  const canAct = idea.status === 'NEW';
  const score = idea.score;

  return (
    <tr className="group border-b border-zinc-800/60 transition-colors hover:bg-zinc-800/20">
      {/* Title + hook */}
      <td className="px-5 py-3.5">
        <p className="font-medium text-zinc-200 leading-snug">{idea.title}</p>
        <p className="mt-0.5 text-xs text-zinc-600 line-clamp-1">{idea.hook}</p>
      </td>

      {/* Category */}
      <td className="px-4 py-3.5">
        <Badge variant="secondary" className="whitespace-nowrap">
          {CATEGORY_LABELS[idea.category]}
        </Badge>
      </td>

      {/* Format */}
      <td className="px-4 py-3.5">
        <span className="text-xs text-zinc-500 capitalize">
          {idea.format.replace('_', ' ').toLowerCase()}
        </span>
      </td>

      {/* Duration */}
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-1 text-xs text-zinc-500">
          <Clock className="h-3 w-3" />
          {formatDuration(idea.estimatedDurationSec)}
        </div>
      </td>

      {/* Score */}
      <td className="px-4 py-3.5">
        {score !== null ? (
          <div className="flex items-center gap-1.5">
            <div
              className={`h-1.5 w-12 overflow-hidden rounded-full bg-zinc-800`}
            >
              <div
                className={`h-full rounded-full ${
                  score >= 90 ? 'bg-emerald-500' : score >= 75 ? 'bg-brand-500' : 'bg-amber-500'
                }`}
                style={{ width: `${score}%` }}
              />
            </div>
            <span className="tabular-nums text-xs text-zinc-500">{score}</span>
          </div>
        ) : (
          <span className="text-xs text-zinc-700">—</span>
        )}
      </td>

      {/* Created */}
      <td className="px-4 py-3.5">
        <span className="text-xs text-zinc-500">{formatRelative(idea.createdAt)}</span>
      </td>

      {/* Status */}
      <td className="px-4 py-3.5">
        <StatusBadge meta={ideaStatusConfig[idea.status]} size="sm" />
      </td>

      {/* Actions */}
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {canAct && (
            <>
              <Button
                variant="outline"
                size="sm"
                leftIcon={Play}
                onClick={() => onSelect(idea.id)}
                disabled={isPending}
                title="Select for production"
                id={`idea-select-${idea.id}`}
                className="h-7 px-2 text-xs"
              >
                Select
              </Button>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={X}
                onClick={() => onReject(idea.id)}
                disabled={isPending}
                title="Reject idea"
                id={`idea-reject-${idea.id}`}
                className="h-7 px-2 text-xs text-zinc-600 hover:text-red-400"
              >
                Reject
              </Button>
            </>
          )}
          {idea.status === 'SELECTED' && (
            <span className="text-xs text-emerald-500">Selected ✓</span>
          )}
          {idea.status === 'CONVERTED' && (
            <span className="text-xs text-blue-400">In Production</span>
          )}
        </div>
      </td>
    </tr>
  );
}

// ─── Ideas page ───────────────────────────────────────────────────────────────

export function IdeasPage() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [generateOpen, setGenerateOpen] = useState(false);

  const { data: ideas, isLoading, error, refetch } = useIdeas();
  const { mutate: updateStatus, isPending: isUpdating } = useUpdateIdeaStatus();

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  }

  function handleSelect(id: string) {
    updateStatus(
      { id, status: 'SELECTED' },
      {
        onSuccess: () => notify.success('Idea selected', 'Idea is now ready for production.'),
        onError: () => notify.error('Failed', 'Could not update idea status.'),
      },
    );
  }

  function handleReject(id: string) {
    updateStatus(
      { id, status: 'REJECTED' },
      {
        onSuccess: () => notify.info('Idea rejected'),
        onError: () => notify.error('Failed', 'Could not update idea status.'),
      },
    );
  }

  const filtered = useMemo(() => {
    if (!ideas) return [];

    let result = [...ideas];

    // Search
    const q = search.toLowerCase();
    if (q) {
      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.hook.toLowerCase().includes(q) ||
          i.niche.toLowerCase().includes(q),
      );
    }

    // Category filter
    if (categoryFilter) {
      result = result.filter((i) => i.category === categoryFilter);
    }

    // Status filter
    if (statusFilter) {
      result = result.filter((i) => i.status === (statusFilter as IdeaStatus));
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'createdAt') {
        cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortField === 'score') {
        cmp = (a.score ?? 0) - (b.score ?? 0);
      } else if (sortField === 'estimatedDurationSec') {
        cmp = a.estimatedDurationSec - b.estimatedDurationSec;
      } else if (sortField === 'title') {
        cmp = a.title.localeCompare(b.title);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [ideas, search, categoryFilter, statusFilter, sortField, sortDir]);

  // Count by status for header pills
  const counts = useMemo(() => {
    if (!ideas) return { NEW: 0, SELECTED: 0, CONVERTED: 0, REJECTED: 0 };
    return ideas.reduce(
      (acc, idea) => {
        acc[idea.status] = (acc[idea.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<IdeaStatus, number>,
    );
  }, [ideas]);

  return (
    <div className="space-y-5 animate-fade-in">
      <PageHeader
        title="Idea Backlog"
        description="Browse, filter, and convert content ideas into productions"
        actions={
          <Button
            variant="brand"
            size="sm"
            leftIcon={Sparkles}
            onClick={() => setGenerateOpen(true)}
            id="open-generate-ideas-btn"
          >
            Generate Ideas
          </Button>
        }
      />

      {/* Summary pills */}
      {ideas && (
        <div className="flex flex-wrap items-center gap-2">
          {(Object.entries(counts) as [IdeaStatus, number][]).map(([status, count]) => (
            <button
              key={status}
              onClick={() => setStatusFilter(statusFilter === status ? '' : status)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
                statusFilter === status
                  ? `${ideaStatusConfig[status].bgClass} ${ideaStatusConfig[status].textClass} ${ideaStatusConfig[status].ringClass}`
                  : 'bg-zinc-900 text-zinc-500 ring-zinc-800 hover:ring-zinc-700 hover:text-zinc-300'
              }`}
            >
              {ideaStatusConfig[status].label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                statusFilter === status ? 'bg-black/20' : 'bg-zinc-800'
              }`}>
                {count}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
          <input
            id="idea-search"
            type="text"
            placeholder="Search ideas…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-800/50 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
        </div>
        <div className="w-44">
          <Select
            options={CATEGORY_OPTIONS}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            id="idea-category-filter"
          />
        </div>
        <div className="w-40">
          <Select
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            id="idea-status-filter"
          />
        </div>
        {(search || categoryFilter || statusFilter) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearch(''); setCategoryFilter(''); setStatusFilter(''); }}
            className="text-zinc-500"
          >
            Clear filters
          </Button>
        )}
        {filtered.length !== (ideas?.length ?? 0) && (
          <span className="ml-auto text-xs text-zinc-600">
            {filtered.length} of {ideas?.length ?? 0} ideas
          </span>
        )}
      </div>

      {/* Table */}
      {isLoading ? (
        <LoadingScreen message="Loading ideas…" />
      ) : error ? (
        <ErrorState
          title="Could not load ideas"
          message="There was an error fetching your idea backlog."
          onRetry={refetch}
        />
      ) : !ideas || ideas.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title="No ideas yet"
          description="Generate your first batch of ideas using the button above."
          action={{ label: 'Generate Ideas', onClick: () => setGenerateOpen(true) }}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching ideas"
          description="Try adjusting your search or filter criteria."
          action={{ label: 'Clear filters', onClick: () => { setSearch(''); setCategoryFilter(''); setStatusFilter(''); } }}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="grid">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-5 py-3 text-left">
                    <SortButton field="title" label="Title" current={sortField} dir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Category</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Format</th>
                  <th className="px-4 py-3 text-left">
                    <SortButton field="estimatedDurationSec" label="Duration" current={sortField} dir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortButton field="score" label="Score" current={sortField} dir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-4 py-3 text-left">
                    <SortButton field="createdAt" label="Created" current={sortField} dir={sortDir} onSort={handleSort} />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((idea) => (
                  <IdeaRow
                    key={idea.id}
                    idea={idea}
                    onSelect={handleSelect}
                    onReject={handleReject}
                    isPending={isUpdating}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <GenerateIdeasModal open={generateOpen} onClose={() => setGenerateOpen(false)} />
    </div>
  );
}
