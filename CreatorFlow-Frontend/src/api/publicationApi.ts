import type { PublicationJob, Platform, PublicationStatus } from '@/types';
import { mockPublications } from '@/mocks/publications';
import { mockDelay } from './_mock';
import { apiRequest, realApi } from './_http';

let _publications = [...mockPublications];

export const publicationApi = {
  async getPublications(): Promise<PublicationJob[]> {
    if (realApi) return apiRequest('/api/publication-jobs');
    await mockDelay();
    return [..._publications];
  },

  async getPublication(id: string): Promise<PublicationJob> {
    if (realApi) return apiRequest(`/api/publication-jobs/${encodeURIComponent(id)}`);
    await mockDelay();
    const pub = _publications.find((p) => p.id === id);
    if (!pub) throw new Error(`Publication ${id} not found`);
    return { ...pub };
  },

  async schedulePublication(params: {
    contentId: string;
    contentTitle: string;
    platform: Platform;
    scheduledAt: string;
    caption: string;
    title: string;
    hashtags: string[];
  }): Promise<PublicationJob> {
    if (realApi) return apiRequest('/api/publication-jobs', { method: 'POST', body: JSON.stringify(params) });
    await mockDelay(600);
    const newPub: PublicationJob = {
      id: `pub-${Date.now()}`,
      ...params,
      status: 'SCHEDULED',
      publishedAt: null,
      attempts: 0,
      maxAttempts: 3,
      error: null,
      platformPostId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    _publications = [newPub, ..._publications];
    return newPub;
  },

  async updatePublicationStatus(id: string, status: PublicationStatus): Promise<PublicationJob> {
    if (realApi) return apiRequest(`/api/publication-jobs/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    await mockDelay(300);
    const pub = _publications.find((p) => p.id === id);
    if (!pub) throw new Error(`Publication ${id} not found`);
    pub.status = status;
    pub.updatedAt = new Date().toISOString();
    return { ...pub };
  },

  async retryPublication(id: string): Promise<PublicationJob> {
    if (realApi) return apiRequest(`/api/publication-jobs/${encodeURIComponent(id)}/retry`, { method: 'POST' });
    await mockDelay(500);
    const pub = _publications.find((p) => p.id === id);
    if (!pub) throw new Error(`Publication ${id} not found`);
    pub.status = 'RETRYING';
    pub.attempts += 1;
    pub.error = null;
    pub.updatedAt = new Date().toISOString();
    return { ...pub };
  },

  async publishNow(id: string): Promise<PublicationJob> {
    if (realApi) {
      return apiRequest(`/api/publication-jobs/${encodeURIComponent(id)}/publish-now`, { method: 'POST' });
    }
    await mockDelay(600);
    const pub = _publications.find((p) => p.id === id);
    if (!pub) throw new Error(`Publication ${id} not found`);
    pub.status = 'PUBLISHED';
    pub.publishedAt = new Date().toISOString();
    pub.platformPostId = `post-${Date.now().toString(36)}`;
    pub.error = null;
    pub.updatedAt = new Date().toISOString();
    return { ...pub };
  },

  async updatePublicationDetails(
    id: string,
    updates: Partial<Pick<PublicationJob, 'title' | 'caption' | 'description' | 'hashtags' | 'scheduledAt'>>,
  ): Promise<PublicationJob> {
    if (realApi) return apiRequest(`/api/publication-jobs/${encodeURIComponent(id)}/details`, { method: 'PATCH', body: JSON.stringify(updates) });
    await mockDelay(300);
    const pub = _publications.find((p) => p.id === id);
    if (!pub) throw new Error(`Publication ${id} not found`);
    Object.assign(pub, updates);
    pub.updatedAt = new Date().toISOString();
    return { ...pub };
  },
};
