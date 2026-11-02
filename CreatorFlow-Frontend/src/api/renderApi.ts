import type { RenderJob } from '@/types';
import { mockRenderJobs } from '@/mocks/renders';
import { mockDelay } from './_mock';
import { apiRequest, realApi } from './_http';

let _renders = [...mockRenderJobs];

export const renderApi = {
  async getRenderJobs(): Promise<RenderJob[]> {
    if (realApi) return apiRequest('/api/render-jobs');
    await mockDelay();
    return [..._renders];
  },

  async getRenderJob(id: string): Promise<RenderJob> {
    if (realApi) return apiRequest(`/api/render-jobs/${encodeURIComponent(id)}`);
    await mockDelay();
    const job = _renders.find((r) => r.id === id);
    if (!job) throw new Error(`Render job ${id} not found`);
    return { ...job };
  },

  async retryRenderJob(id: string): Promise<RenderJob> {
    if (realApi) return apiRequest(`/api/render-jobs/${encodeURIComponent(id)}/retry`, { method: 'POST' });
    await mockDelay(500);
    const job = _renders.find((r) => r.id === id);
    if (!job) throw new Error(`Render job ${id} not found`);
    job.status = 'RETRYING';
    job.retryCount += 1;
    job.progressPercent = 0;
    job.error = null;
    job.updatedAt = new Date().toISOString();
    return { ...job };
  },

  async cancelRenderJob(id: string): Promise<void> {
    if (realApi) return apiRequest(`/api/render-jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
    await mockDelay(300);
    const job = _renders.find((r) => r.id === id);
    if (!job) throw new Error(`Render job ${id} not found`);
    _renders = _renders.filter((r) => r.id !== id);
  },

  async getRenderLogs(id: string): Promise<string[]> {
    if (realApi) return apiRequest(`/api/render-jobs/${encodeURIComponent(id)}/logs`);
    await mockDelay(300);
    const job = _renders.find((r) => r.id === id);
    if (!job) throw new Error(`Render job ${id} not found`);
    return job.logs;
  },
};
