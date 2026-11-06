import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { codingApi } from '@/api/codingApi';
import { Button, Input } from '@/components/ui';
import type { CodingInventory } from '@/types';

export function CodingExecutionsPanel({ agentId, foundation }: { agentId: string; foundation?: CodingInventory }) {
  const cache = useQueryClient();
  const state = useQuery({queryKey: ['coding-executions'], queryFn: codingApi.executions, refetchInterval: 3000, retry: false});
  const [workspace, setWorkspace] = useState(''), [policy, setPolicy] = useState(''), [objective, setObjective] = useState('Update README.md with one fixture-only sentence.'), [files, setFiles] = useState('README.md');
  const [timeout, setTimeout] = useState(60), [expiry, setExpiry] = useState(5), [confirm, setConfirm] = useState<string | null>(null);
  const refresh = async () => { await Promise.all([cache.invalidateQueries({queryKey: ['coding-executions']}), cache.invalidateQueries({queryKey: ['coding']})]); };
  const draft = useMutation({mutationFn: () => codingApi.executionDraft(workspace, objective, files.split(',').map(s => s.trim()).filter(Boolean), policy, timeout), onSuccess: refresh});
  const approve = useMutation({mutationFn: ({id, hash}: {id: string; hash: string}) => codingApi.authorizeExecution(id, hash, expiry), onSuccess: async () => {setConfirm(null); await refresh();}});
  const cancel = useMutation({mutationFn: codingApi.cancelExecution, onSuccess: refresh});
  const capability = state.data?.capabilities.find(c => c.agent_id === agentId);
  const selectClass = 'w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500';
  return <section aria-label="Codex coding execution" className="space-y-4 rounded-xl border border-zinc-800 p-4">
    <h2 className="font-semibold">Codex coding execution</h2>
    <p className="text-sm text-zinc-400">One explicitly approved task, exact existing text files, one attempt. Results stop at REVIEW_REQUIRED. No push, merge, deployment or Gemini executor.</p>
    {[state.error, draft.error, approve.error, cancel.error].filter(Boolean).map((error, i) => <p role="alert" key={i} className="text-sm text-red-400">{(error as Error).message}</p>)}
    <p role="status" className="text-sm text-amber-300">Executor {state.data?.executionEnabled ? 'Configured' : 'DISABLED'} | Sandbox {capability?.sandbox_verified ? 'Canary passed' : 'BLOCKED / NOT_VERIFIED'} | CLI {capability?.cli_version ?? 'Unknown'} | {capability?.error_code ?? 'No error reported'} | Last probe {capability ? new Date(capability.observed_at).toLocaleString() : 'Never'}</p>
    <p className="text-xs text-zinc-400">A sandbox report expires after 60 seconds; the agent probes again before inference. UI approval never bypasses sandbox, quota, credentials or lease. Live acceptance: {state.data?.liveVerification ?? 'UNKNOWN'}.</p>
    <form onSubmit={e => {e.preventDefault(); draft.mutate();}} className="grid gap-3 xl:grid-cols-2">
      <label className="space-y-1 text-sm">Execution workspace<select className={selectClass} value={workspace} onChange={e => setWorkspace(e.target.value)} required><option value="">Choose READY workspace</option>{foundation?.workspaces.filter(w => w.agent_id === agentId && w.state === 'READY' && !w.writer_locked).map(w => <option key={w.id} value={w.id}>{w.id} | {w.base_commit}</option>)}</select></label>
      <label className="space-y-1 text-sm">Execution budget policy<select className={selectClass} value={policy} onChange={e => setPolicy(e.target.value)} required><option value="">Choose Codex policy</option>{foundation?.policies.filter(p => p.agent_id === agentId && p.provider === 'CODEX_CLI').map(p => <option key={p.id} value={p.id}>{p.id} | {p.enabled ? 'Enabled' : 'Disabled'} | {p.max_reserved_seconds}s</option>)}</select></label>
      <Input label="Coding objective" value={objective} onChange={e => setObjective(e.target.value)} required maxLength={2000} />
      <Input label="Exact allowed existing files (comma separated)" value={files} onChange={e => setFiles(e.target.value)} required maxLength={1600} />
      <Input label="Execution timeout seconds" type="number" min={5} max={60} value={timeout} onChange={e => setTimeout(Number(e.target.value))} required />
      <div className="self-end"><Button type="submit" disabled={draft.isPending || !workspace || !policy}>Create execution draft</Button></div>
    </form>
    <Input label="Approval expires in minutes" type="number" min={2} max={15} value={expiry} onChange={e => {setExpiry(Number(e.target.value)); setConfirm(null);}} />
    {!state.data?.executions.length && <p className="text-sm text-zinc-400">No coding executions</p>}
    {state.data?.executions.filter(e => e.agent_id === agentId).map(execution => {
      const authorization = state.data.authorizations.find(a => a.id === execution.authorization_id);
      const task = execution.contract.task;
      return <article key={execution.id} className="space-y-2 break-all rounded-lg border border-zinc-700 p-3 text-sm">
        <h3 className="font-semibold">{execution.id} | {execution.state}</h3>
        <p>{task.objective}</p><p>Workspace {execution.workspace_id} | Base {execution.contract.baseCommit} | Checkpoint {execution.contract.checkpointId}</p>
        <p>Provider {task.provider} | Files {task.allowedFiles.join(', ')} | Budget {task.budgetPolicyId} | {task.timeoutSec}s / {task.maxAttempts} attempt</p>
        <p>Exact approval fingerprint: {execution.contract_hash}</p>
        <p>Session {execution.session_id ?? 'Not claimed'} | Lease {execution.lease_expires_at ? new Date(execution.lease_expires_at).toLocaleString() : 'None'} | Attempt {execution.attempt}</p>
        {authorization && <p>Operator {authorization.operator_id} | Credential generation {authorization.credential_generation} | Expires {new Date(authorization.expires_at).toLocaleString()} | {authorization.revoked_at ? 'REVOKED' : 'Issued'}</p>}
        {execution.error_code && <p role="status" className="text-amber-300">{execution.error_code}</p>}
        {['DRAFT','BLOCKED'].includes(execution.state) && <div className="space-y-2"><label className="flex items-center gap-2"><input type="checkbox" checked={confirm === execution.id} onChange={e => setConfirm(e.target.checked ? execution.id : null)} />I authorize this exact task, workspace, base, files, Codex provider, budget and expiry</label><Button disabled={confirm !== execution.id || approve.isPending} onClick={() => approve.mutate({id: execution.id, hash: execution.contract_hash})}>Authorize exact Codex task</Button></div>}
        {['DRAFT','BLOCKED','AUTHORIZED','CLAIMED','RUNNING','CANCEL_REQUESTED'].includes(execution.state) && <Button variant="outline" disabled={cancel.isPending || execution.state === 'CANCEL_REQUESTED'} onClick={() => cancel.mutate(execution.id)}>Cancel coding task</Button>}
        <ul className="text-xs text-zinc-400">{state.data.events.filter(event => event.execution_id === execution.id).slice(0,8).map(event => <li key={event.id}>{new Date(event.created_at).toLocaleString()} | {event.type}</li>)}</ul>
        {execution.diff !== null && <details><summary className="cursor-pointer">Review diff ({execution.changed_files?.join(', ') || 'No changed files'})</summary><p>Diff SHA-256 {execution.diff_sha256} | Checkpoint {execution.checkpoint_id} | Evidence {execution.evidence_hash}</p><pre className="max-h-96 overflow-auto whitespace-pre rounded bg-zinc-950 p-3 text-xs">{execution.diff}</pre></details>}
      </article>;
    })}
  </section>;
}
