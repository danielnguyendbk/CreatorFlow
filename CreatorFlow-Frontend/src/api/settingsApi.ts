import type { SystemSettings } from '@/types';
import { mockSettings } from '@/mocks/settings';
import { mockDelay } from './_mock';
import { apiRequest, realApi } from './_http';

let _settings: SystemSettings = { ...mockSettings };

export const settingsApi = {
  async getSettings(): Promise<SystemSettings> {
    if (realApi) return apiRequest('/api/settings');
    await mockDelay(300);
    return { ..._settings };
  },

  async updateSettings(partial: Partial<SystemSettings>): Promise<SystemSettings> {
    if (realApi) return apiRequest('/api/settings', { method: 'PATCH', body: JSON.stringify(partial) });
    await mockDelay(500);
    _settings = { ..._settings, ...partial };
    return { ..._settings };
  },
};
