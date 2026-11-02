import type { WorkflowInstance } from '@/types';
import { mockWorkflows } from '@/mocks/workflows';
import { mockDelay } from './_mock';
import { apiRequest, realApi } from './_http';

const _workflows = [...mockWorkflows];

export const workflowApi = {
  async getWorkflows(): Promise<WorkflowInstance[]> {
    if (realApi) return apiRequest('/api/workflows');
    await mockDelay();
    return [..._workflows];
  },

  async getWorkflow(id: string): Promise<WorkflowInstance> {
    if (realApi) return apiRequest(`/api/workflows/${encodeURIComponent(id)}`);
    await mockDelay();
    const wf = _workflows.find((w) => w.id === id);
    if (!wf) throw new Error(`Workflow ${id} not found`);
    return { ...wf };
  },

  async retryWorkflow(id: string): Promise<WorkflowInstance> {
    if (realApi) return apiRequest(`/api/workflows/${encodeURIComponent(id)}/retry`, { method: 'POST' });
    await mockDelay(500);
    const wf = _workflows.find((w) => w.id === id);
    if (!wf) throw new Error(`Workflow ${id} not found`);
    wf.status = 'RUNNING';
    wf.retryCount += 1;
    wf.updatedAt = new Date().toISOString();
    return { ...wf };
  },

  async cancelWorkflow(id: string): Promise<WorkflowInstance> {
    if (realApi) return apiRequest(`/api/workflows/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
    await mockDelay(300);
    const wf = _workflows.find((w) => w.id === id);
    if (!wf) throw new Error(`Workflow ${id} not found`);
    wf.status = 'CANCELLED';
    wf.updatedAt = new Date().toISOString();
    return { ...wf };
  },

  async resumeWorkflow(id: string): Promise<WorkflowInstance> {
    if (realApi) return apiRequest(`/api/workflows/${encodeURIComponent(id)}/resume`, { method: 'POST' });
    await mockDelay(400);
    const wf = _workflows.find((w) => w.id === id);
    if (!wf) throw new Error(`Workflow ${id} not found`);
    wf.status = 'RUNNING';
    wf.currentNode = 'RenderVideo';
    const waitingNode = wf.nodes.find((n) => n.status === 'WAITING');
    if (waitingNode) {
      waitingNode.status = 'COMPLETED';
      waitingNode.completedAt = new Date().toISOString();
    }
    wf.updatedAt = new Date().toISOString();
    return { ...wf };
  },
};
