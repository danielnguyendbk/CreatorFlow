import type { CodingInventory, CredentialInventory, CodingRepository, CodingAdmissionResult, CodingExecution, CodingExecutionInventory } from '@/types';
import { apiRequest, realApi } from './_http';
const base = '/api/v2/coding';
function backend() { if (!realApi) throw new Error('Coding foundation requires the real backend.'); }
export const codingApi = {
  executions: () => { backend(); return apiRequest<CodingExecutionInventory>(base + '/executions'); },
  executionDraft: (workspaceId: string, objective: string, allowedFiles: string[], budgetPolicyId: string, timeoutSec: number) => {
    backend(); return apiRequest<CodingExecution>(base + '/executions', { method: 'POST', body: JSON.stringify({workspaceId, taskType: 'CODEX_EXECUTE', provider: 'CODEX_CLI', objective, allowedFiles, budgetPolicyId, timeoutSec, maxAttempts: 1, requestKey: crypto.randomUUID()}) });
  },
  authorizeExecution: (id: string, contractHash: string, expiresInMinutes: number) => { backend(); return apiRequest<CodingExecution>(`${base}/executions/${encodeURIComponent(id)}/authorize`, { method: 'POST', body: JSON.stringify({contractHash, confirmation: 'AUTHORIZE_CODEX', expiresInMinutes}) }); },
  cancelExecution: (id: string) => { backend(); return apiRequest<CodingExecution>(`${base}/executions/${encodeURIComponent(id)}/cancel`, { method: 'POST' }); },
  inventory: () => { backend(); return apiRequest<CodingInventory>(base); },
  credentials: () => { backend(); return apiRequest<CredentialInventory>('/api/v2/agent-credentials'); },
  register: (input: { agentId: string; canonicalPath: string; remoteUrl: string; allowedBases: string[]; protectedBranches: string[] }) => {
    backend(); return apiRequest<CodingRepository>(base + '/repositories', { method: 'POST', body: JSON.stringify(input) });
  },
  prepare: (repository: CodingRepository, baseRef: string, objective: string) => {
    backend(); return apiRequest(base + '/workspaces', { method: 'POST', body: JSON.stringify({ repositoryId: repository.id, baseRef, baseCommit: repository.verifiedCommits[baseRef],
      role: 'CODEX_EXECUTOR', allowedScope: 'WORKSPACE_ONLY', objective, allowedFiles: ['src/**', 'README.md'], prohibitedPaths: ['private/**'], timeoutSec: 30, maxAttempts: 1,
      budgetPolicyId: null, provider: 'NONE', idempotencyKey: crypto.randomUUID(), checkpointReferences: [], taskType: 'WORKTREE_PREPARE' }) });
  },
  operation: (workspaceId: string, taskType: string) => { backend(); return apiRequest(base + '/operations', { method: 'POST', body: JSON.stringify({ workspaceId, taskType, idempotencyKey: crypto.randomUUID() }) }); },
  policy: (input: { agentId: string; provider: string; enabled: boolean; operatorAuthorized: boolean; maxConcurrent: number; maxDurationSec: number; maxAttempts: number; maxReservedSeconds: number }) => {
    backend(); return apiRequest(base + '/budget-policies', { method: 'POST', body: JSON.stringify(input) });
  },
  admission: (agentId: string, provider: string, reserve: boolean) => { backend(); return apiRequest<CodingAdmissionResult>(base + '/admission', { method: 'POST', body: JSON.stringify({ requestId: crypto.randomUUID(), agentId, provider, timeoutSec: 30, maxAttempts: 1, reserve }) }); },
  credential: (agentId: string, action: 'rotate' | 'revoke') => { backend(); return apiRequest(`/api/v2/agent-credentials/${encodeURIComponent(agentId)}/${action}`, { method: 'POST', body: JSON.stringify({ confirmation: action.toUpperCase() }) }); },
  enrollment: (minutes: number) => { backend(); return apiRequest('/api/v2/agent-credentials/enrollment', { method: 'POST', body: JSON.stringify({ minutes, confirmation: 'ENROLL' }) }); },
};
