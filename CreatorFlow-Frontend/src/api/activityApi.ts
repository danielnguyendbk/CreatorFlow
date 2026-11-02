import type { ActivityEvent } from '@/types';
import { mockActivity } from '@/mocks/activity';
import { mockDelay } from './_mock';
import { apiRequest, realApi } from './_http';

export const activityApi = {
  async getEvents(limit = 50): Promise<ActivityEvent[]> {
    if (realApi) return apiRequest(`/api/activity?limit=${limit}`);
    await mockDelay(300);
    return [...mockActivity].slice(0, limit);
  },

  async getEventsByEntity(entityId: string): Promise<ActivityEvent[]> {
    if (realApi) return (await apiRequest<ActivityEvent[]>(`/api/activity?limit=200`)).filter((e) => e.entityId === entityId);
    await mockDelay(300);
    return mockActivity.filter((e) => e.entityId === entityId);
  },
};
