import type { ContentIdea, IdeaStatus } from '@/types';
import { mockIdeas } from '@/mocks/ideas';
import { mockDelay } from './_mock';

let _ideas = [...mockIdeas];

export const ideaApi = {
  async getIdeas(): Promise<ContentIdea[]> {
    await mockDelay();
    return [..._ideas];
  },

  async getIdea(id: string): Promise<ContentIdea> {
    await mockDelay();
    const idea = _ideas.find((i) => i.id === id);
    if (!idea) throw new Error(`Idea ${id} not found`);
    return { ...idea };
  },

  async updateIdeaStatus(id: string, status: IdeaStatus): Promise<ContentIdea> {
    await mockDelay(300);
    const idea = _ideas.find((i) => i.id === id);
    if (!idea) throw new Error(`Idea ${id} not found`);
    idea.status = status;
    idea.updatedAt = new Date().toISOString();
    return { ...idea };
  },

  async generateIdeas(params: {
    niche: string;
    language: string;
    count: number;
    targetDurationSec: number;
    style: string;
  }): Promise<ContentIdea[]> {
    await mockDelay(1500); // simulate AI call
    const generated: ContentIdea[] = Array.from({ length: params.count }, (_, i) => ({
      id: `idea-gen-${Date.now()}-${i}`,
      title: `[Generated] ${params.niche} Concept ${i + 1}`,
      hook: `A fresh take on ${params.niche} that will change how you think about it.`,
      category: 'OTHER',
      format: 'EXPLAINER',
      estimatedDurationSec: params.targetDurationSec,
      status: 'NEW' as IdeaStatus,
      score: Math.floor(Math.random() * 30) + 70,
      language: params.language,
      niche: params.niche,
      notes: `Style: ${params.style}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    _ideas = [...generated, ..._ideas];
    return generated;
  },

  async deleteIdea(id: string): Promise<void> {
    await mockDelay(300);
    _ideas = _ideas.filter((i) => i.id !== id);
  },
};
