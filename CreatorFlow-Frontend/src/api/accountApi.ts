import type { ProviderAccount, ReconnectIntent } from '@/types';
import { apiRequest, realApi } from './_http';

function requireBackend() {
  if (!realApi) throw new Error('Account Manager requires the real backend. Configure VITE_API_BASE_URL.');
}

export const accountApi = {
  list: () => { requireBackend(); return apiRequest<ProviderAccount[]>('/api/v2/accounts'); },
  refresh: () => { requireBackend(); return apiRequest<ProviderAccount[]>('/api/v2/accounts/refresh', { method: 'POST' }); },
  reconnect: (provider: string) => {
    requireBackend();
    return apiRequest<ReconnectIntent>(`/api/v2/accounts/${encodeURIComponent(provider)}/reconnect-intent`, { method: 'POST' });
  },
};
