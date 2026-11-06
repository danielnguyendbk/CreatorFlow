import { useMutation, useQuery } from '@tanstack/react-query';
import { telegramApi } from '@/api/telegramApi';
import { Button, PageHeader } from '@/components/ui';

const time = (value: string | null) => value ? new Date(value).toLocaleString() : 'Never';

export function TelegramIntegrationPage() {
  const status = useQuery({ queryKey: ['telegram-status'], queryFn: telegramApi.status, refetchInterval: 5000, retry: false });
  const approvals = useQuery({ queryKey: ['telegram-approvals'], queryFn: telegramApi.approvals, refetchInterval: 5000, retry: false });
  const routing = useMutation({ mutationFn: telegramApi.routingTest });
  const data = status.data;
  return <div className="space-y-6">
    <PageHeader title="Telegram Integration" description="Workflow control and notifications through registered Telegram groups."
      actions={<Button variant="outline" onClick={() => routing.mutate()} disabled={routing.isPending || !data}>Validate routing</Button>} />
    {status.isPending && <p role="status">Loading Telegram configuration…</p>}
    {[status.error, approvals.error, routing.error].filter(Boolean).map((error, index) => <p key={index} role="alert" className="text-sm text-red-400">{(error as Error).message}</p>)}
    {data && <>
      <section className="space-y-2 rounded-xl border border-zinc-800 p-4" aria-label="Telegram status">
        <h2 className="font-semibold text-zinc-100">{data.state}</h2>
        <p className="text-sm text-zinc-300">Long polling · Local backend · {data.bots.length} registered bot identities</p>
        <p className="text-sm text-zinc-400">Credentials are configured on the backend host. Register numeric chat/user IDs through the authenticated operator API. No token is entered or displayed here.</p>
        <p className="text-sm text-zinc-400">Bot messages are ignored. CodeBot coordinates through PostgreSQL; Gemini executor and reviewer are future roles.</p>
      </section>
      <section className="space-y-3" aria-label="Bot availability">
        <h2 className="font-semibold">Bot availability</h2>
        {!data.bots.length && <p className="text-sm text-zinc-400">NOT_CONFIGURED — no bot identity registered. Live Telegram is unverified.</p>}
        {data.bots.map(bot => <article key={bot.identity} className="space-y-1 rounded-xl border border-zinc-800 p-4 text-sm">
          <h3 className="font-semibold">{bot.identity} · {bot.botId}</h3>
          <p>{bot.configured ? bot.availability : 'NOT_CONFIGURED'}{data.state === 'DISABLED' ? ' · Polling disabled' : ''}</p>
          <p className="text-zinc-400">Last poll: {time(bot.lastPollAt)} · Last successful send: {time(bot.lastSuccessfulSendAt)} · Offset: {bot.nextOffset}</p>
          {bot.errorCode && <p className="text-amber-400">{bot.errorCode}</p>}
        </article>)}
      </section>
      <div className="grid gap-4 lg:grid-cols-3">{(['CODE', 'CONTENT', 'VIDEO'] as const).map(kind => <section key={kind} aria-label={`${kind} group mappings`} className="space-y-3 rounded-xl border border-zinc-800 p-4">
        <h2 className="font-semibold">{kind}</h2>
        {!data.routes.some(r => r.kind === kind) && <p className="text-sm text-zinc-400">No registered group</p>}
        {data.routes.filter(r => r.kind === kind).map(route => <div key={`${route.botIdentity}:${route.chatId}`} className="space-y-1 text-sm">
          <h3>{route.botIdentity} · {route.chatId}</h3>
          <p className="text-zinc-400">Control: {route.canControl ? 'Allowed' : 'Disabled'} · Approvals: {route.canApprove ? 'Allowed' : 'Disabled'}</p>
          <ul className="space-y-1">{data.operators.filter(o => o.botIdentity === route.botIdentity && o.chatId === route.chatId).map(o => <li key={o.userId}>User {o.userId} · {o.role}</li>)}</ul>
        </div>)}
      </section>)}</div>
      {routing.data && <section role="status" className="space-y-2 rounded-xl border border-zinc-800 p-4">
        <h2 className="font-semibold">Routing validation · {routing.data.delivery}</h2>
        <p className="text-sm text-zinc-400">Registered mappings checked in PostgreSQL. This check sends no Telegram messages.</p>
        <ul>{routing.data.routes.map(r => <li key={`${r.botIdentity}:${r.chatId}`} className="text-sm">{r.kind} · {r.botIdentity} · {r.chatId} · {r.operators} identities</li>)}</ul>
      </section>}
      <section className="space-y-3" aria-label="Delivery summary">
        <h2 className="font-semibold">Delivery summary</h2>
        <p className="text-sm text-zinc-400">{data.outbox.length ? data.outbox.map(o => `${o.state}: ${o.count}`).join(' · ') : 'No outbound events'}</p>
        <p className="text-sm text-zinc-400">UNKNOWN sends require operator reconciliation. Telegram cannot guarantee exactly-once delivery.</p>
        <ul className="space-y-2">{data.errors.map(e => <li key={e.id} className="break-all rounded-lg border border-zinc-800 p-3 text-sm">{e.state} · {e.errorCode} · Attempts {e.attempts} · {e.refType} {e.refId}</li>)}</ul>
      </section>
    </>}
    <section className="space-y-3" aria-label="Approval queue">
      <h2 className="font-semibold">Approval queue</h2>
      <p className="text-sm text-zinc-400">Fixture review only. Decisions require the assigned Telegram operator in the registered chat; approval does not publish content.</p>
      {approvals.data?.length === 0 && <p className="text-sm text-zinc-400">No approval requests</p>}
      {approvals.data?.map(a => <article key={a.id} className="space-y-1 break-all rounded-xl border border-zinc-800 p-4 text-sm">
        <h3 className="font-semibold">{a.state} · {a.id}</h3>
        <p>Cycle {a.cycle_id} · {a.action}</p>
        <p className="text-zinc-400">Operator {a.required_operator} · {a.bot_identity} / {a.chat_id} · Expires {time(a.expires_at)}</p>
        <p className="text-zinc-400">Decision: {a.decision_actor ?? 'Pending'} · {time(a.decision_at)} · Evidence {a.evidence_ref}</p>
      </article>)}
    </section>
  </div>;
}
