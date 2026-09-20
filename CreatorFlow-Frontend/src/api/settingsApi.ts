import type { SystemSettings } from '@/types';
import { mockSettings } from '@/mocks/settings';
import { mockDelay } from './_mock';

let _settings: SystemSettings = { ...mockSettings };

export const settingsApi = {
  async getSettings(): Promise<SystemSettings> {
    await mockDelay(300);
    return { ..._settings };
  },

  async updateSettings(partial: Partial<SystemSettings>): Promise<SystemSettings> {
    await mockDelay(500);
    _settings = { ..._settings, ...partial };
    return { ..._settings };
  },
};
