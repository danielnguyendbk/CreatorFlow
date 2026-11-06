import { apiRequest, realApi } from './_http';
import type { CodexUsage, UsageHistoryEntry } from '@/types';
const query = (agentId?: string) => agentId ? `?agentId=${encodeURIComponent(agentId)}` : '';
function backend() { if (!realApi) throw new Error('AI Usage requires the real backend and Windows agent.'); }
export const usageApi = {
  overview: () => { backend(); return apiRequest<{ otherProviders: {provider: string; status: string}[] }>('/api/v2/usage'); },
  codex: (agentId?: string) => { backend(); return apiRequest<CodexUsage>(`/api/v2/usage/codex${query(agentId)}`); },
  history: (agentId?: string) => { backend(); return apiRequest<UsageHistoryEntry[]>(`/api/v2/usage/history${query(agentId)}`); },
  refresh: (agentId?: string) => { backend(); return apiRequest<{status: string}> (`/api/v2/usage/refresh${query(agentId)}`, { method: 'POST' }); },
};
