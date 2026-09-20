import type { ActivityEvent } from '@/types';
import { mockActivity } from '@/mocks/activity';
import { mockDelay } from './_mock';

export const activityApi = {
  async getEvents(limit = 50): Promise<ActivityEvent[]> {
    await mockDelay(300);
    return [...mockActivity].slice(0, limit);
  },

  async getEventsByEntity(entityId: string): Promise<ActivityEvent[]> {
    await mockDelay(300);
    return mockActivity.filter((e) => e.entityId === entityId);
  },
};
