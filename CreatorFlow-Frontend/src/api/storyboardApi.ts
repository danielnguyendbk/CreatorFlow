import type { Storyboard, Scene } from '@/types';
import { mockStoryboards } from '@/mocks/storyboards';
import { mockDelay } from './_mock';

const _storyboards = [...mockStoryboards];

function generateFallbackStoryboard(contentId: string): Storyboard {
  return {
    id: `sb-${contentId}`,
    contentId,
    title: `Storyboard for ${contentId}`,
    totalDurationSec: 60,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    scenes: [
      {
        id: `scene-${contentId}-01`,
        storyboardId: `sb-${contentId}`,
        sceneNumber: 1,
        durationSec: 10,
        narration: 'Every system reaches a bottleneck eventually. Here is the core problem and why naive solutions fail.',
        visualType: 'AI_VIDEO',
        prompt: 'Futuristic high-tech computer architecture visualization, dark mode neon glow, intricate circuitry',
        assetStatus: 'READY',
        assetId: 'asset-001',
        notes: null,
      },
      {
        id: `scene-${contentId}-02`,
        storyboardId: `sb-${contentId}`,
        sceneNumber: 2,
        durationSec: 15,
        narration: 'When scale increases tenfold, traditional synchronous handling causes cascading failure and thread starvation.',
        visualType: 'DIAGRAM',
        prompt: 'System architecture diagram showing message queue decoupling and asynchronous worker threads',
        assetStatus: 'READY',
        assetId: 'asset-002',
        notes: 'Emphasize decoupling with animated nodes',
      },
      {
        id: `scene-${contentId}-03`,
        storyboardId: `sb-${contentId}`,
        sceneNumber: 3,
        durationSec: 20,
        narration: 'By applying this battle-tested pattern, latency drops by 80% while memory usage remains predictable and stable.',
        visualType: 'AI_VIDEO',
        prompt: 'Performance graph spiking up then stabilizing gracefully, high-end 3D visual, emerald green accents',
        assetStatus: 'READY',
        assetId: 'asset-003',
        notes: null,
      },
      {
        id: `scene-${contentId}-04`,
        storyboardId: `sb-${contentId}`,
        sceneNumber: 4,
        durationSec: 15,
        narration: 'In the next video, we benchmark real-world throughput in production. Subscribe so you do not miss it.',
        visualType: 'TEXT',
        prompt: 'Clean subscription banner with subtle motion blur, modern typography, CreatorFlow watermark',
        assetStatus: 'READY',
        assetId: 'asset-004',
        notes: null,
      },
    ],
  };
}

export const storyboardApi = {
  async getStoryboardByContent(contentId: string): Promise<Storyboard | null> {
    await mockDelay();
    let sb = _storyboards.find((s) => s.contentId === contentId);
    if (!sb) {
      sb = generateFallbackStoryboard(contentId);
      _storyboards.push(sb);
    }
    return { ...sb, scenes: [...sb.scenes] };
  },

  async getStoryboard(id: string): Promise<Storyboard> {
    await mockDelay();
    const sb = _storyboards.find((s) => s.id === id);
    if (!sb) throw new Error(`Storyboard ${id} not found`);
    return { ...sb, scenes: [...sb.scenes] };
  },

  async updateScene(
    storyboardId: string,
    sceneId: string,
    updates: Partial<Scene>,
  ): Promise<Storyboard> {
    await mockDelay(300);
    const sb = _storyboards.find((s) => s.id === storyboardId);
    if (!sb) throw new Error(`Storyboard ${storyboardId} not found`);
    const sceneIndex = sb.scenes.findIndex((sc) => sc.id === sceneId);
    if (sceneIndex === -1) throw new Error(`Scene ${sceneId} not found`);
    sb.scenes[sceneIndex] = { ...sb.scenes[sceneIndex], ...updates };
    sb.updatedAt = new Date().toISOString();
    return { ...sb, scenes: [...sb.scenes] };
  },
};
