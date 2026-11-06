import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { accountApi } from '@/api/accountApi';
import { Button, PageHeader } from '@/components/ui';
import type { ReconnectIntent } from '@/types';
import { UsageWidget } from '@/features/usage/AiUsagePage';

const labels = { CONNECTED: 'Connected', EXPIRED: 'Expired', UNSUPPORTED: 'Unsupported', UNKNOWN: 'Unknown' };

export function AccountManagerPage() {
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ['accounts'], queryFn: accountApi.list, retry: false });
  const [intent, setIntent] = useState<ReconnectIntent | null>(null);
  const refresh = useMutation({ mutationFn: accountApi.refresh, onSuccess: (data) => cache.setQueryData(['accounts'], data) });
  const reconnect = useMutation({ mutationFn: accountApi.reconnect, onSuccess: setIntent });
  const error = query.error ?? refresh.error ?? reconnect.error;
  return (
    <div className="space-y-6">
      <PageHeader title="Account Manager" description="Provider capabilities and connection health from this backend host." />
      <UsageWidget compact />
      <p className="text-sm text-zinc-400">CLI sign-in stays in the official tool. Local login status does not verify provider reachability or quota.</p>
      <Button onClick={() => refresh.mutate()} disabled={refresh.isPending || query.isPending}>
        {refresh.isPending ? 'Checking health…' : 'Refresh health'}
      </Button>
      {query.isPending && <p role="status">Loading accounts…</p>}
      {error && <p role="alert" className="text-red-400">{error.message}</p>}
      <ul className="grid gap-4 md:grid-cols-2" aria-label="AI providers">
        {query.data?.map((account) => (
          <li key={account.provider} className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="font-semibold text-zinc-100">{account.displayName}</h2>
            <p className="text-sm text-zinc-300">Installation: {account.provider.endsWith('_CLI') ? account.installed ? 'Installed' : account.checkedAt ? 'Not detected' : 'Unknown' : 'Not applicable'}</p>
            <p className="text-sm text-zinc-300">Connection: {labels[account.status]}</p>
            <p className="break-words text-xs text-zinc-400">{account.healthCode}</p>
            <p className="text-xs text-zinc-400">Last checked: {account.checkedAt ? new Date(account.checkedAt).toLocaleString() : 'Never'}</p>
            <Button disabled={account.reconnectCapability !== 'SUPPORTED' || reconnect.isPending}
              onClick={() => { setIntent(null); reconnect.mutate(account.provider); }}>
              {account.status === 'CONNECTED' || account.status === 'EXPIRED' ? 'Reconnect' : 'Connect'} {account.displayName}
            </Button>
            {account.reconnectCapability !== 'SUPPORTED' && <p className="text-xs text-zinc-400">Reconnect unsupported. Configure the provider in the backend environment.</p>}
            <p className="text-xs text-zinc-400">Default account selection: {account.switchingCapability.toLowerCase()}. Use the official tool to manage its active identity.</p>
          </li>
        ))}
      </ul>
      {intent && <section aria-label="Official sign-in instructions" aria-live="polite" className="space-y-3 rounded-xl border border-zinc-700 p-5">
        <h2 className="font-semibold">Complete sign-in in your terminal</h2>
        <p className="text-sm text-zinc-300">{intent.instructions}</p>
        <code className="block rounded bg-zinc-900 p-3">{intent.command}</code>
        <a className="text-sm text-brand-400 underline focus-visible:outline" href={intent.documentationUrl} target="_blank" rel="noreferrer">Official authentication documentation</a>
        <p className="text-xs text-zinc-400">Status: {intent.status}. Refresh health after completing the flow.</p>
      </section>}
    </div>
  );
}
