import type { Storyboard } from '@/types';

export const mockStoryboards: Storyboard[] = [
  {
    id: 'sb-001',
    contentId: 'content-281',
    title: 'Why Redis Is Fast — Storyboard',
    totalDurationSec: 58,
    version: 1,
    createdAt: '2026-09-18T09:00:00Z',
    updatedAt: '2026-09-18T09:30:00Z',
    scenes: [
      {
        id: 'scene-001-01',
        storyboardId: 'sb-001',
        sceneNumber: 1,
        durationSec: 8,
        narration:
          'Every second, Redis can process over a million operations. No database comes close. But why?',
        visualType: 'AI_VIDEO',
        prompt:
          'A cinematic visualization of millions of data packets flowing at high speed through glowing fiber-optic cables, dark background, electric blue tones, fast-paced motion',
        assetStatus: 'READY',
        assetId: 'asset-001',
        notes: null,
      },
      {
        id: 'scene-001-02',
        storyboardId: 'sb-001',
        sceneNumber: 2,
        durationSec: 10,
        narration:
          'The first reason: Redis keeps most data directly in memory. No disk seeks. No I/O wait. Pure RAM speed.',
        visualType: 'AI_VIDEO',
        prompt:
          'A visualization of RAM memory chips glowing, data writing at lightning speed, clean technical aesthetic, deep navy background',
        assetStatus: 'WAITING_FOR_ASSET',
        assetId: null,
        notes: 'Critical scene — must show contrast between RAM and disk speed',
      },
      {
        id: 'scene-001-03',
        storyboardId: 'sb-001',
        sceneNumber: 3,
        durationSec: 12,
        narration:
          'Redis uses a single-threaded event loop. No locking overhead, no race conditions, no context switching.',
        visualType: 'DIAGRAM',
        prompt:
          'A clean diagram showing a single-threaded event loop processing queue, arrows showing sequential operation, minimal design',
        assetStatus: 'READY',
        assetId: 'asset-002',
        notes: null,
      },
      {
        id: 'scene-001-04',
        storyboardId: 'sb-001',
        sceneNumber: 4,
        durationSec: 10,
        narration:
          'The data structures are insanely optimized. Hash tables, skip lists, radix trees — each designed for minimal memory footprint.',
        visualType: 'AI_VIDEO',
        prompt:
          'Abstract visualization of data structures — hash tables and trees morphing into each other, geometric shapes, dark academic aesthetic',
        assetStatus: 'WAITING_FOR_ASSET',
        assetId: null,
        notes: null,
      },
      {
        id: 'scene-001-05',
        storyboardId: 'sb-001',
        sceneNumber: 5,
        durationSec: 10,
        narration:
          'Redis also uses non-blocking I/O via epoll on Linux. While it waits for one client, it serves thousands of others.',
        visualType: 'AI_VIDEO',
        prompt:
          'A visualization of a server handling many simultaneous connections, like a traffic controller managing parallel lanes, tech aesthetic',
        assetStatus: 'READY',
        assetId: 'asset-003',
        notes: null,
      },
      {
        id: 'scene-001-06',
        storyboardId: 'sb-001',
        sceneNumber: 6,
        durationSec: 8,
        narration:
          'Result? Over a million ops per second on commodity hardware. That\'s why Redis is the world\'s most loved cache.',
        visualType: 'TEXT',
        prompt: '1,000,000+ ops/sec — displayed as a counter spinning up',
        assetStatus: 'READY',
        assetId: 'asset-004',
        notes: null,
      },
    ],
  },
];
