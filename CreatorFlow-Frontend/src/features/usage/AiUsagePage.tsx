import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usageApi } from '@/api/usageApi';
import { agentApi } from '@/api/agentApi';
import { settingsApi } from '@/api/settingsApi';
import { Button, PageHeader } from '@/components/ui';
import type { QuotaWindow } from '@/types';

function resetLabel(epoch: number | null | undefined, timezone: string, now: number) {
  if (epoch == null) return 'Reset time not available';
  const remaining = Math.max(0, Math.ceil((epoch * 1000 - now) / 60000));
  let display: string;
  try { display = new Date(epoch * 1000).toLocaleString(undefined, { timeZone: timezone }); }
  catch { display = new Date(epoch * 1000).toLocaleString(); }
  return `${display} (${timezone}) · ${remaining > 0 ? `${Math.floor(remaining / 60)}h ${remaining % 60}m remaining` : 'Reset time passed; awaiting provider update'}`;
}

export function QuotaCard({ title, window, timezone, now }: { title: string; window: QuotaWindow; timezone: string; now: number }) {
  return <section className="space-y-2 rounded-xl border border-zinc-800 p-4" aria-label={title}>
    <h3 className="font-semibold text-zinc-200">{title}</h3>
    {window.status === 'AVAILABLE' ? <>
      <p className="text-sm text-zinc-300">{window.usedPercent}% used · {window.remainingPercent}% remaining</p>
      <progress className="h-3 w-full accent-blue-500" max={100} value={window.usedPercent} aria-label={`${title} used percentage`} />
      <p className={window.warning === 'NORMAL' ? 'text-sm text-zinc-400' : 'text-sm text-amber-400'}>{window.warning}</p>
      <p className="text-xs text-zinc-400">{resetLabel(window.resetsAt, timezone, now)}</p>
    </> : <p className="text-sm text-zinc-400">{window.status}</p>}
  </section>;
}

export function UsageWidget({ compact = false, agentId }: { compact?: boolean; agentId?: string }) {
  const cache = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const usage = useQuery({ queryKey: ['codex-usage', agentId], queryFn: () => usageApi.codex(agentId), refetchInterval: 5000, retry: false });
  const settings = useQuery({ queryKey: ['settings'], queryFn: settingsApi.getSettings, retry: false });
  const refresh = useMutation({ mutationFn: () => usageApi.refresh(agentId), onSuccess: () => { setCooldown(Date.now() + 30000); void cache.invalidateQueries({ queryKey: ['codex-usage'] }); } });
  const data = usage.data;
  const timezone = settings.data?.general.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (compact) return <section aria-label="Codex quota widget" className="space-y-3 rounded-xl border border-zinc-800 p-4">
    <h2 className="font-semibold">Codex quota · {data?.freshness ?? 'UNKNOWN'}</h2>
    {usage.error && <p role="alert">{usage.error.message}</p>}
    <p className="text-sm text-zinc-400">5-hour: {data?.fiveHour.status === 'AVAILABLE' ? `${data.fiveHour.remainingPercent}% remaining` : data?.fiveHour.status ?? 'UNKNOWN'} · Weekly: {data?.weekly.status === 'AVAILABLE' ? `${data.weekly.remainingPercent}% remaining` : data?.weekly.status ?? 'UNKNOWN'}</p>
    <p className="text-xs text-zinc-400">Last synced: {data?.lastSynced ? new Date(data.lastSynced).toLocaleString() : 'Never'}</p>
    <Link className="text-sm text-blue-400 underline" to="/ai-usage">Open AI Usage</Link>
  </section>;
  return <div className="space-y-4">
    {(usage.error || refresh.error) && <p role="alert" className="text-red-400">{(usage.error ?? refresh.error)?.message}</p>}
    {usage.isPending && <p role="status">Loading quota snapshots…</p>}
    <div className="flex flex-wrap items-center gap-3">
      <p className="font-semibold">Codex · {data?.freshness ?? 'UNKNOWN'}</p>
      <Button disabled={refresh.isPending || now < cooldown} onClick={() => refresh.mutate()}>Refresh quota</Button>
      {data?.refreshState === 'PENDING' && <p role="status" className="text-sm text-zinc-400">Refresh requested. Waiting for Local Agent; timeout 45 seconds.</p>}
      {now < cooldown && <p className="text-xs text-zinc-400">Refresh cooldown: {Math.ceil((cooldown - now) / 1000)} seconds.</p>}
    </div>
    {data?.errorCode && <p role="alert" className="text-amber-400">{data.connection}: {data.errorCode}</p>}
    {data && <>
      <p className="text-xs text-zinc-400">Agent: {data.agentId ?? 'None'} · Source: {data.source} · CLI: {data.cliVersion ?? 'Unknown'}</p>
      <p className="text-xs text-zinc-400">Last synced: {data.lastSynced ? new Date(data.lastSynced).toLocaleString() : 'Never'} · Last good: {data.lastGoodAt ? new Date(data.lastGoodAt).toLocaleString() : 'Never'}</p>
      {data.freshness !== 'LIVE' && <p className="text-sm text-amber-400">Quota is {data.freshness}. Any values shown are last known data; refresh before AI automation.</p>}
      <div className="grid gap-4 md:grid-cols-2"><QuotaCard title="Codex 5-hour usage" window={data.fiveHour} timezone={timezone} now={now} /><QuotaCard title="Codex weekly usage" window={data.weekly} timezone={timezone} now={now} /></div>
      {data.credits && <p className="text-sm">Credits: {data.credits.unlimited ? 'Unlimited (provider reported)' : data.credits.balance ?? 'Balance not available'}</p>}
      {data.tokens && <p className="text-sm text-zinc-400">Lifetime tokens: {data.tokens.lifetimeTokens ?? 'Not available'} · Peak daily tokens: {data.tokens.peakDailyTokens ?? 'Not available'}. Token activity is separate from quota percentage.</p>}
      <p className="text-sm text-zinc-400">AI readiness: {data.automationReadiness}. LOW below {data.thresholds.low}%; CRITICAL below {data.thresholds.critical}%. Git/FFmpeg fixture tasks do not consume AI quota.</p>
    </>}
  </div>;
}

export function AiUsagePage() {
  const [agentId, setAgentId] = useState('');
  const agents = useQuery({ queryKey: ['local-agents'], queryFn: agentApi.agents, refetchInterval: 10000 });
  const history = useQuery({ queryKey: ['usage-history', agentId], queryFn: () => usageApi.history(agentId || undefined), refetchInterval: 5000, retry: false });
  const overview = useQuery({ queryKey: ['usage-providers'], queryFn: usageApi.overview, refetchInterval: 180000, retry: false });
  return <div className="space-y-6">
    <PageHeader title="AI Usage" description="Read-only provider quota collected by the authenticated Windows Local Agent." />
    <label className="flex max-w-lg flex-col gap-2 text-sm">Current agent<select className="rounded border border-zinc-700 bg-zinc-900 p-2" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
      <option value="">Most recently active agent</option>{agents.data?.map((agent) => <option key={agent.id} value={agent.id}>{agent.name} ({agent.status})</option>)}
    </select></label>
    <UsageWidget agentId={agentId || undefined} />
    <section className="space-y-2" aria-label="Usage history"><h2 className="font-semibold">Usage history</h2>
      {history.error && <p role="alert">{history.error.message}</p>}
      <ol className="space-y-2 text-sm text-zinc-400">{history.data?.map((snapshot) => <li key={snapshot.id}>{new Date(snapshot.observedAt).toLocaleString()} · {snapshot.status} · CLI {snapshot.cliVersion ?? 'Unknown'} · {snapshot.windows.map((w) => `${w.windowDurationMins === 300 ? '5h' : w.windowDurationMins === 10080 ? 'Weekly' : `${w.windowDurationMins}m`}: ${w.usedPercent}% used`).join(' · ') || 'No quota data'}</li>)}</ol>
    </section>
    {overview.error && <p role="alert">{overview.error.message}</p>}
    <ul className="text-sm text-zinc-400" aria-label="Other AI providers">{overview.data?.otherProviders.map((provider) => <li key={provider.provider}>{provider.provider}: {provider.status}</li>)}</ul>
  </div>;
}
