import type { LocalAgent, AgentTask, AgentTaskKind, AgentTaskEvent, TaskCycle } from '@/types';
import { apiRequest, realApi } from './_http';

function backend() {
  if (!realApi) throw new Error('Agent Monitoring requires the real backend. Configure VITE_API_BASE_URL.');
}
export const agentApi = {
  cycle: (id: string) => { backend(); return apiRequest<TaskCycle>(`/api/v2/task-cycles/${encodeURIComponent(id)}`); },
  createCycle: (agentId: string) => {
    backend(); return apiRequest<TaskCycle>('/api/v2/task-cycles', { method: 'POST', body: JSON.stringify({ agentId, idempotencyKey: crypto.randomUUID(), nodes: [
      { key: 'build', kind: 'GIT_FIXTURE', dependsOn: [] }, { key: 'verify', kind: 'FFMPEG_FIXTURE', dependsOn: ['build'] },
      { key: 'probe', kind: 'CAPABILITY_PROBE', dependsOn: ['verify'] },
    ] }) });
  },
  agents: () => { backend(); return apiRequest<LocalAgent[]>('/api/v2/agents'); },
  tasks: () => { backend(); return apiRequest<AgentTask[]>('/api/v2/agent-tasks'); },
  events: (id: string) => { backend(); return apiRequest<AgentTaskEvent[]>(`/api/v2/agent-tasks/${encodeURIComponent(id)}/events`); },
  create: (input: { agentId: string; kind: AgentTaskKind; worktreeKey: string; timeoutSec: number; durationSec: number; idempotencyKey: string }) => {
    backend(); return apiRequest<AgentTask>('/api/v2/agent-tasks', { method: 'POST', body: JSON.stringify(input) });
  },
  cancel: (id: string) => { backend(); return apiRequest<AgentTask>(`/api/v2/agent-tasks/${encodeURIComponent(id)}/cancel`, { method: 'POST' }); },
};
