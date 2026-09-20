import type { Content, ContentStatus } from '@/types';
import { mockContents } from '@/mocks/contents';
import { mockDelay } from './_mock';

let _contents = [...mockContents];

export const contentApi = {
  async getContents(): Promise<Content[]> {
    await mockDelay();
    return [..._contents];
  },

  async getContent(id: string): Promise<Content> {
    await mockDelay();
    const content = _contents.find((c) => c.id === id);
    if (!content) throw new Error(`Content ${id} not found`);
    return { ...content };
  },

  async updateContentStatus(id: string, status: ContentStatus): Promise<Content> {
    await mockDelay(300);
    const content = _contents.find((c) => c.id === id);
    if (!content) throw new Error(`Content ${id} not found`);
    content.status = status;
    content.updatedAt = new Date().toISOString();
    return { ...content };
  },

  async retryStage(id: string, stage: string): Promise<Content> {
    await mockDelay(400);
    const content = _contents.find((c) => c.id === id);
    if (!content) throw new Error(`Content ${id} not found`);
    const s = content.stages.find((st) => st.stage === stage);
    if (s) {
      s.status = 'IN_PROGRESS';
      s.error = null;
      s.retryCount += 1;
      s.startedAt = new Date().toISOString();
    }
    content.status = 'IN_PROGRESS';
    content.updatedAt = new Date().toISOString();
    return { ...content };
  },

  async resumeWorkflow(id: string): Promise<Content> {
    await mockDelay(400);
    const content = _contents.find((c) => c.id === id);
    if (!content) throw new Error(`Content ${id} not found`);
    content.status = 'RENDERING';
    content.currentStage = 'RENDER';
    content.progressPercent = 75;
    const vaStage = content.stages.find((st) => st.stage === 'VISUAL_ASSETS');
    if (vaStage) {
      vaStage.status = 'COMPLETED';
      vaStage.completedAt = new Date().toISOString();
    }
    const renderStage = content.stages.find((st) => st.stage === 'RENDER');
    if (renderStage) {
      renderStage.status = 'IN_PROGRESS';
      renderStage.startedAt = new Date().toISOString();
    }
    content.updatedAt = new Date().toISOString();
    return { ...content };
  },

  async createContent(params: {
    title: string;
    topic: string;
    niche: string;
    language: string;
    ideaId?: string;
  }): Promise<Content> {
    await mockDelay(600);
    const newContent: Content = {
      id: `content-${Date.now()}`,
      title: params.title,
      topic: params.topic,
      status: 'DRAFT',
      currentStage: 'SCRIPT',
      progressPercent: 0,
      ideaId: params.ideaId ?? null,
      workflowInstanceId: null,
      storyboardId: null,
      scheduledPublicationAt: null,
      language: params.language,
      niche: params.niche,
      tags: [],
      stages: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    _contents = [newContent, ..._contents];
    return newContent;
  },

  async getDashboardStats(): Promise<{
    todayIdeas: number;
    scriptsReady: number;
    needFlowClips: number;
    rendering: number;
    readyToPublish: number;
    scheduled: number;
    failed: number;
    stageCounts: Record<string, number>;
  }> {
    await mockDelay(300);
    return {
      todayIdeas: 10,
      scriptsReady: 6,
      needFlowClips: 3,
      rendering: 1,
      readyToPublish: 4,
      scheduled: 7,
      failed: 0,
      stageCounts: {
        IDEA: 10,
        SCRIPT: 6,
        STORYBOARD: 5,
        VOICE: 4,
        VISUAL_ASSETS: 3,
        RENDER: 1,
        READY: 4,
        PUBLISHED: 12,
      },
    };
  },
};
