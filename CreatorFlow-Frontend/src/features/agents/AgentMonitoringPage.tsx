import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agentApi } from '@/api/agentApi';
import { Button, PageHeader } from '@/components/ui';
import type { AgentTaskKind } from '@/types';

const kinds: { value: AgentTaskKind; label: string }[] = [
  { value: 'GIT_FIXTURE', label: 'Git fixture' },
  { value: 'FFMPEG_FIXTURE', label: 'FFmpeg fixture' },
  { value: 'CAPABILITY_PROBE', label: 'Capability probe' },
];
const field = 'rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 focus-visible:outline focus-visible:outline-brand-400';

export function AgentMonitoringPage() {
  const cache = useQueryClient();
  const agents = useQuery({ queryKey: ['local-agents'], queryFn: agentApi.agents, refetchInterval: 2000, retry: false });
  const tasks = useQuery({ queryKey: ['agent-tasks'], queryFn: agentApi.tasks, refetchInterval: 1000, retry: false });
  const [agentId, setAgentId] = useState('');
  const [worktreeKey, setWorktreeKey] = useState('dashboard-fixture');
  const [timeoutSec, setTimeoutSec] = useState(15);
  const [durationSec, setDurationSec] = useState(1);
  const [selectedTask, setSelectedTask] = useState('');
  const chosen = agentId || agents.data?.[0]?.id || '';
  const current = agents.data?.find((agent) => agent.id === chosen);
  const events = useQuery({ queryKey: ['agent-events', selectedTask], queryFn: () => agentApi.events(selectedTask), enabled: Boolean(selectedTask), refetchInterval: 1000, retry: false });
  const enqueue = useMutation({ mutationFn: agentApi.create, onSuccess: (task) => { setSelectedTask(task.id); void cache.invalidateQueries({ queryKey: ['agent-tasks'] }); } });
  const cancel = useMutation({ mutationFn: agentApi.cancel, onSuccess: () => { void cache.invalidateQueries({ queryKey: ['agent-tasks'] }); } });
  const error = agents.error ?? tasks.error ?? enqueue.error ?? cancel.error ?? events.error;
  const valid = /^[a-z0-9][a-z0-9_-]{0,47}$/.test(worktreeKey) && Number.isInteger(timeoutSec) && timeoutSec >= 1 && timeoutSec <= 60 && Number.isInteger(durationSec) && durationSec >= 1 && durationSec <= 30;
  return <div className="space-y-6">
    <PageHeader title="Agent Monitoring" description="Heartbeat, fixed fixture tasks and persisted execution results." />
    {error && <p role="alert" className="text-red-400">{error.message}</p>}
    {agents.isPending && <p role="status">Loading agents…</p>}
    {agents.data?.length === 0 && <p className="text-sm text-zinc-400">No agents registered. Start the Windows agent with its separate enrollment credential.</p>}
    <ul aria-label="Local agents" className="space-y-3">
      {agents.data?.map((agent) => <li key={agent.id} className="rounded-xl border border-zinc-800 p-4">
        <h2 className="font-semibold text-zinc-200">{agent.name} — {agent.status}</h2>
        <p className="text-sm text-zinc-400">Last heartbeat: {agent.lastHeartbeatAt ? new Date(agent.lastHeartbeatAt).toLocaleString() : 'Never'} · Version {agent.version}</p>
        <p className="text-sm text-zinc-400">Capabilities: {agent.capabilities.join(', ') || 'None reported'}</p>
        <p className="text-xs text-zinc-500">{agent.id}</p>
      </li>)}
    </ul>
    <section aria-labelledby="fixture-heading" className="space-y-4 rounded-xl border border-zinc-800 p-4">
      <h2 id="fixture-heading" className="font-semibold text-zinc-200">Run a local fixture</h2>
      <p className="text-sm text-zinc-400">Fixtures run in the agent's isolated workspace. Offline agents keep tasks queued until they reconnect.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm">Agent<select className={field} value={chosen} onChange={(event) => setAgentId(event.target.value)}>
          <option value="" disabled>Select agent</option>
          {agents.data?.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} ({agent.status})</option>)}
        </select></label>
        <label className="flex flex-col gap-1 text-sm">Fixture worktree key<input className={field} value={worktreeKey} maxLength={48} onChange={(event) => setWorktreeKey(event.target.value)} /></label>
        <label className="flex flex-col gap-1 text-sm">Timeout (seconds)<input className={field} type="number" min={1} max={60} value={timeoutSec} onChange={(event) => setTimeoutSec(Number(event.target.value))} /></label>
        <label className="flex flex-col gap-1 text-sm">Video duration (seconds)<input className={field} type="number" min={1} max={30} value={durationSec} onChange={(event) => setDurationSec(Number(event.target.value))} /></label>
      </div>
      {!valid && <p role="alert" className="text-amber-400">Use a lowercase worktree key, timeout 1–60 and duration 1–30 seconds.</p>}
      <div className="flex flex-wrap gap-2">
        {kinds.map((kind) => <Button key={kind.value} disabled={!valid || !current?.capabilities.includes(kind.value) || enqueue.isPending}
          onClick={() => enqueue.mutate({ agentId: chosen, kind: kind.value, worktreeKey, timeoutSec, durationSec, idempotencyKey: crypto.randomUUID() })}>Run {kind.label}</Button>)}
      </div>
      {current && kinds.some((kind) => !current.capabilities.includes(kind.value)) && <p className="text-sm text-zinc-400">Unavailable tools are disabled according to the agent's reported capabilities.</p>}
    </section>
    <section aria-labelledby="task-heading" className="space-y-3">
      <h2 id="task-heading" className="font-semibold text-zinc-200">Recent tasks</h2>
      <ul aria-label="Agent tasks" className="space-y-3">
        {tasks.data?.map((task) => <li key={task.id} className="space-y-2 rounded-xl border border-zinc-800 p-4">
          <h3 className="text-sm font-semibold">{task.kind} — {task.state}</h3>
          <p className="text-xs text-zinc-400">{task.id} · Attempt {task.attempt}/{task.maxAttempts} · {task.worktreeKey}</p>
          {task.errorCode && <p className="text-sm text-amber-400">{task.errorCode}</p>}
          {task.result && <pre className="overflow-x-auto rounded bg-zinc-900 p-3 text-xs text-zinc-300">{JSON.stringify(task.result, null, 2)}</pre>}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setSelectedTask(task.id)}>Events {task.id.slice(0, 8)}</Button>
            {['QUEUED', 'RUNNING', 'CANCEL_REQUESTED'].includes(task.state) && <Button size="sm" disabled={task.state === 'CANCEL_REQUESTED' || cancel.isPending} onClick={() => cancel.mutate(task.id)}>Cancel {task.id.slice(0, 8)}</Button>}
          </div>
        </li>)}
      </ul>
    </section>
    {selectedTask && <section aria-label="Task events" className="space-y-2">
      <h2 className="font-semibold text-zinc-200">Events · {selectedTask}</h2>
      <ol className="space-y-1 text-sm text-zinc-400">{events.data?.map((event) => <li key={event.id}>{event.type} · attempt {event.attempt} · {new Date(event.createdAt).toLocaleString()}</li>)}</ol>
    </section>}
  </div>;
}
