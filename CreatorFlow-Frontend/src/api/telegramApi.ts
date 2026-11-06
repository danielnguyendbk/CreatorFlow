import type { TelegramStatus, TelegramApproval, TelegramRoutingTest } from '@/types';
import { apiRequest, realApi } from './_http';

function backend() {
  if (!realApi) throw new Error('Telegram Integration requires the real backend. Configure VITE_API_BASE_URL.');
}
export const telegramApi = {
  status: () => { backend(); return apiRequest<TelegramStatus>('/api/v2/telegram'); },
  approvals: () => { backend(); return apiRequest<TelegramApproval[]>('/api/v2/telegram/approvals'); },
  routingTest: () => { backend(); return apiRequest<TelegramRoutingTest>('/api/v2/telegram/routing-test', { method: 'POST' }); },
};
