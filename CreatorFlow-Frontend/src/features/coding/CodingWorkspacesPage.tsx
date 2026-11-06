import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { codingApi } from '@/api/codingApi';
import { agentApi } from '@/api/agentApi';
import { Button, Input, PageHeader } from '@/components/ui';
import { UsageWidget } from '@/features/usage/AiUsagePage';
import { CodingExecutionsPanel } from './CodingExecutionsPanel';

export function CodingWorkspacesPage() {
  const cache = useQueryClient();
  const inventory = useQuery({ queryKey: ['coding'], queryFn: codingApi.inventory, refetchInterval: 3000, retry: false });
  const credentials = useQuery({ queryKey: ['agent-credentials'], queryFn: codingApi.credentials, refetchInterval: 3000, retry: false });
  const agents = useQuery({ queryKey: ['agents'], queryFn: agentApi.agents, refetchInterval: 3000, retry: false });
  const [agent, setAgent] = useState(''), [path, setPath] = useState(''), [remote, setRemote] = useState(''), [bases, setBases] = useState('main');
  const [repositoryId, setRepository] = useState(''), [baseRef, setBase] = useState('main'), [objective, setObjective] = useState('Prepare and inspect isolated workspace; no AI execution');
  const [confirmed, setConfirmed] = useState(false), [policyEnabled, setPolicyEnabled] = useState(false), [authorized, setAuthorized] = useState(false);
  const [provider, setProvider] = useState('CODEX_CLI'), [budget, setBudget] = useState(60), [reserve, setReserve] = useState(false), [message, setMessage] = useState('');
  const selectedAgent = agent || agents.data?.[0]?.id || '';
  const refresh = async () => { await Promise.all([cache.invalidateQueries({ queryKey: ['coding'] }), cache.invalidateQueries({ queryKey: ['agent-credentials'] }), cache.invalidateQueries({ queryKey: ['agents'] })]); };
  const register = useMutation({ mutationFn: () => codingApi.register({ agentId: selectedAgent, canonicalPath: path, remoteUrl: remote, allowedBases: bases.split(',').map(v => v.trim()).filter(Boolean), protectedBranches: ['main', 'develop'] }), onSuccess: async result => { setRepository(result.id); setMessage('Repository registered. Waiting for assigned agent verification.'); await refresh(); } });
  const selectedRepo = inventory.data?.repositories.find(r => r.id === repositoryId);
  const prepare = useMutation({ mutationFn: () => { if (!selectedRepo) throw new Error('Choose a verified repository'); return codingApi.prepare(selectedRepo, baseRef, objective); }, onSuccess: async () => { setMessage('Prepare request persisted; waiting for the actual agent result.'); await refresh(); } });
  const operation = useMutation({ mutationFn: ({ id, kind }: { id: string; kind: string }) => codingApi.operation(id, kind), onSuccess: async () => { setMessage('Operation requested; inspect persisted task/workspace state for completion.'); await refresh(); } });
  const policy = useMutation({ mutationFn: () => codingApi.policy({ agentId: selectedAgent, provider, enabled: policyEnabled, operatorAuthorized: authorized, maxConcurrent: 1, maxDurationSec: 60, maxAttempts: 1, maxReservedSeconds: budget }), onSuccess: async () => { setMessage('Admission policy saved. AI executor remains NOT_ENABLED.'); await refresh(); } });
  const admission = useMutation({ mutationFn: () => codingApi.admission(selectedAgent, provider, reserve), onSuccess: async () => { await refresh(); } });
  const credential = useMutation({ mutationFn: (action: 'rotate' | 'revoke') => { if (!confirmed) throw new Error('Explicit confirmation required'); return codingApi.credential(selectedAgent, action); }, onSuccess: async () => { setConfirmed(false); setMessage('Credential action persisted. Rotation waits for the agent; revocation fences access.'); await refresh(); } });
  const enrollment = useMutation({ mutationFn: (minutes: number) => { if (!confirmed) throw new Error('Explicit confirmation required'); return codingApi.enrollment(minutes); }, onSuccess: async () => { setConfirmed(false); setMessage('Enrollment window updated'); await refresh(); } });
  const busy = register.isPending || prepare.isPending || operation.isPending || policy.isPending || credential.isPending || enrollment.isPending;
  const selectClass = 'w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500';
  return <div className="space-y-6">
    <PageHeader title="Coding Agents / Workspaces" description="Isolated Git preparation and admission foundation. Autonomous AI execution is NOT_ENABLED." />
    {[inventory.error, credentials.error, agents.error, register.error, prepare.error, operation.error, policy.error, admission.error, credential.error, enrollment.error].filter(Boolean).map((e, i) => <p key={i} role="alert" className="text-sm text-red-400">{(e as Error).message}</p>)}
    {message && <p role="status" className="text-sm text-blue-300">{message}</p>}
    <label className="block space-y-2 text-sm">Windows Agent<select className={selectClass} value={selectedAgent} onChange={e => { setAgent(e.target.value); setConfirmed(false); }}>
      <option value="">Select agent</option>{agents.data?.map(a => <option key={a.id} value={a.id}>{a.name} · {a.status}</option>)}
    </select></label>
    <section className="space-y-2 rounded-xl border border-zinc-800 p-4" aria-label="Provider capabilities"><h2 className="font-semibold">Provider capabilities</h2>
      <ul className="text-sm">{inventory.data?.capabilities.filter(c => c.agentId === selectedAgent).map(c => <li key={c.provider}>{c.provider} · {c.installed ? 'Installed' : 'Not detected'} · {c.version ?? 'Version unknown'} · {new Date(c.observedAt).toLocaleString()}{c.provider === 'GEMINI_CLI' ? ' · Quota adapter UNSUPPORTED' : ''}</li>)}</ul>
      <p className="text-sm text-zinc-400">Installed capability and quota admission never enable an AI executor.</p>
    </section>
    {selectedAgent && <UsageWidget compact agentId={selectedAgent} />}
    {selectedAgent && <CodingExecutionsPanel key={selectedAgent} agentId={selectedAgent} foundation={inventory.data} />}
    <div className="grid gap-5 xl:grid-cols-2">
      <form className="space-y-4 rounded-xl border border-zinc-800 p-4" onSubmit={e => { e.preventDefault(); register.mutate(); }}>
        <h2 className="font-semibold">Register approved repository</h2>
        <p className="text-sm text-zinc-400">The agent must explicitly allow this parent root through its local configuration. No clone, fetch or shared-branch writes.</p>
        <Input label="Canonical repository path" value={path} onChange={e => setPath(e.target.value)} required maxLength={512} />
        <Input label="Origin HTTPS metadata URL" value={remote} onChange={e => setRemote(e.target.value)} required maxLength={512} />
        <Input label="Allowed base branches (comma separated)" value={bases} onChange={e => setBases(e.target.value)} required />
        <Button type="submit" disabled={busy || !selectedAgent}>Register repository</Button>
      </form>
      <form className="space-y-4 rounded-xl border border-zinc-800 p-4" onSubmit={e => { e.preventDefault(); prepare.mutate(); }}>
        <h2 className="font-semibold">Prepare isolated worktree</h2>
        <label className="block space-y-1 text-sm">Repository<select className={selectClass} value={repositoryId} onChange={e => setRepository(e.target.value)} required>
          <option value="">Choose registered repository</option>{inventory.data?.repositories.filter(r => r.agentId === selectedAgent).map(r => <option key={r.id} value={r.id}>{r.canonicalPath} · {r.verification}</option>)}
        </select></label>
        <label className="block space-y-1 text-sm">Approved base ref<select className={selectClass} value={baseRef} onChange={e => setBase(e.target.value)}>{(selectedRepo?.allowedBases ?? ['main']).map(b => <option key={b} value={b}>{b}</option>)}</select></label>
        <p className="break-all text-xs text-zinc-400">Exact commit: {selectedRepo?.verifiedCommits[baseRef] ?? 'Not verified'}</p>
        {selectedRepo && <div className="space-y-1 break-all text-xs text-zinc-400"><p>Registry {selectedRepo.id} · {selectedRepo.enabled ? 'Enabled' : 'Disabled'} · Owner {selectedRepo.agentId}</p><p>{selectedRepo.remoteUrl} · Approved by {selectedRepo.approvedBy}</p><p>Protected branches: {selectedRepo.protectedBranches.join(', ')}</p>{selectedRepo.errorCode && <p role="status" className="text-amber-300">{selectedRepo.errorCode}</p>}</div>}
        <Input label="Requested objective (metadata only)" value={objective} onChange={e => setObjective(e.target.value)} required maxLength={2000} />
        <Button type="submit" disabled={busy || !selectedRepo?.enabled || selectedRepo.verification !== 'VERIFIED' || !selectedRepo.verifiedCommits[baseRef]}>Prepare fixture worktree</Button>
        <p className="text-sm text-zinc-400">PLANNER/executor/reviewer/tester are future contract roles. This creates a generated branch/worktree only.</p>
      </form>
    </div>
    <section className="space-y-4" aria-label="Worktree inventory"><h2 className="font-semibold">Worktree inventory</h2>
      {!inventory.data?.workspaces.length && <p className="text-sm text-zinc-400">No workspaces</p>}
      {inventory.data?.workspaces.map(w => <article key={w.id} className="space-y-2 break-all rounded-xl border border-zinc-800 p-4 text-sm">
        <h3 className="font-semibold">{w.id} · {w.state}</h3><p>{w.relative_path} · {w.branch} · {w.base_commit}</p>
        <p className="text-zinc-400">Agent {w.agent_id} · Task {w.current_task_id} · Attempt {w.owner_attempt ?? 'Not claimed'} · Session {w.owner_session ?? 'None'}</p>
        <p className="text-zinc-400">Lease {w.lease_expires_at ? new Date(w.lease_expires_at).toLocaleString() : 'None'} · Writer lock {w.writer_locked ? 'ACTIVE' : 'Not active'} · Cleanup {w.cleanup_state}</p>
        <p className="text-zinc-400">Checkpoint {w.last_checkpoint_id ?? 'Not committed'}</p>{w.error_code && <p className="text-amber-300">{w.error_code}</p>}
        <div className="flex flex-wrap gap-2">
          {['WORKTREE_INSPECT', 'CODING_PREFLIGHT', 'WORKTREE_CLEANUP'].map(kind => <Button key={kind} variant="outline" disabled={busy || w.writer_locked || w.state === 'CLEANED' || kind === 'WORKTREE_CLEANUP' && w.state !== 'READY'} onClick={() => operation.mutate({ id: w.id, kind })}>{kind === 'WORKTREE_INSPECT' ? 'Inspect worktree' : kind === 'CODING_PREFLIGHT' ? 'Coding preflight only' : 'Request safe cleanup'}</Button>)}
        </div>
      </article>)}
    </section>
    <form className="space-y-4 rounded-xl border border-zinc-800 p-4" onSubmit={e => { e.preventDefault(); policy.mutate(); }}>
      <h2 className="font-semibold">Quota / budget admission</h2>
      <label className="block text-sm">Provider<select className={selectClass} value={provider} onChange={e => setProvider(e.target.value)}><option value="CODEX_CLI">Codex CLI</option><option value="GEMINI_CLI">Gemini CLI (quota unsupported)</option></select></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policyEnabled} onChange={e => setPolicyEnabled(e.target.checked)} />Enable foundation admission policy</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)} />Operator authorizes bounded admission checks only</label>
      <Input label="Maximum reserved wall-clock seconds" type="number" min={1} max={720} value={budget} onChange={e => setBudget(Number(e.target.value))} required />
      <p className="text-sm text-zinc-400">One concurrent reservation, max 60-second task/one attempt. Reservations last 60 seconds and measure planned capacity, not provider usage or money. The 5-hour quota window is not a schedule.</p>
      <div className="flex gap-2"><Button type="submit" disabled={busy || !selectedAgent}>Save budget policy</Button><Button type="button" variant="outline" disabled={!selectedAgent || admission.isPending} onClick={() => admission.mutate()}>Check admission</Button></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={reserve} onChange={e => setReserve(e.target.checked)} />Reserve foundation capacity for 60 seconds; never execute AI</label>
      {admission.data && <p role="status" className="text-sm text-blue-300">{admission.data.state} · {admission.data.reason} · Execution NOT_ENABLED</p>}
      <ul className="text-sm text-zinc-400">{inventory.data?.admissions.filter(a => a.agent_id === selectedAgent).slice(0, 5).map(a => <li key={a.id}>{a.state} · {a.reason} · {a.reserved_seconds}s reserved until {a.reserved_until ? new Date(a.reserved_until).toLocaleString() : 'Not reserved'}</li>)}</ul>
    </form>
    <section className="space-y-3 rounded-xl border border-zinc-800 p-4" aria-label="Credential lifecycle"><h2 className="font-semibold">Agent credential lifecycle</h2>
      <ul className="text-sm">{credentials.data?.credentials.filter(c => c.agentId === selectedAgent).map(c => <li key={c.agentId}>Generation {c.generation} · {c.revokedAt ? 'REVOKED' : 'Active'} · Last used {c.lastUsedAt ? new Date(c.lastUsedAt).toLocaleString() : 'Never'}</li>)}</ul>
      <p className="text-sm text-zinc-400">Rotation is agent-generated and atomically stored with current-user DPAPI; no token is shown. Emergency revoke fences sessions and active work. Revoked identities need new operator enrollment.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm the selected agent credential/enrollment action and its effect</label>
      <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy || !confirmed || !selectedAgent} onClick={() => credential.mutate('rotate')}>Request credential rotation</Button><Button variant="destructive" disabled={busy || !confirmed || !selectedAgent} onClick={() => credential.mutate('revoke')}>Emergency revoke credential</Button><Button variant="outline" disabled={busy || !confirmed} onClick={() => enrollment.mutate(5)}>Open enrollment for 5 minutes</Button><Button variant="outline" disabled={busy || !confirmed} onClick={() => enrollment.mutate(0)}>Close enrollment</Button></div>
      <p className="text-sm text-zinc-400">Enrollment enabled until: {credentials.data?.enrollment.enabledUntil ? new Date(credentials.data.enrollment.enabledUntil).toLocaleString() : 'Closed'}</p>
      <p className="text-sm text-zinc-400">Retention: logs {credentials.data?.retention.logsDays}d · temporary worktrees {credentials.data?.retention.temporaryWorktreeDays}d · metadata {credentials.data?.retention.artifactMetadataDays}d. Referenced evidence always retained; no automatic deletion sweep.</p>
    </section>
  </div>;
}
