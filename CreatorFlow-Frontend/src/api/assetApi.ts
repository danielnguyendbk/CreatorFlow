import type { Asset, SceneAssetStatus } from '@/types';
import { mockAssets } from '@/mocks/assets';
import { mockDelay } from './_mock';

let _assets = [...mockAssets];

export const assetApi = {
  async getAssets(): Promise<Asset[]> {
    await mockDelay();
    return [..._assets];
  },

  async getAsset(id: string): Promise<Asset> {
    await mockDelay();
    const asset = _assets.find((a) => a.id === id);
    if (!asset) throw new Error(`Asset ${id} not found`);
    return { ...asset };
  },

  async getAssetsByContent(contentId: string): Promise<Asset[]> {
    await mockDelay(300);
    return _assets.filter((a) => a.contentId === contentId);
  },

  /** Returns scenes waiting for Flow clips, grouped by content */
  async getPendingFlowScenes(): Promise<
    { contentId: string; contentTitle: string; scenes: { sceneId: string; sceneNumber: number; prompt: string }[] }[]
  > {
    await mockDelay(400);
    return [
      {
        contentId: 'content-281',
        contentTitle: 'Why Redis Is Fast',
        scenes: [
          { sceneId: 'scene-001-02', sceneNumber: 2, prompt: 'A visualization of RAM memory chips glowing, data writing at lightning speed, clean technical aesthetic, deep navy background' },
          { sceneId: 'scene-001-04', sceneNumber: 4, prompt: 'Abstract visualization of data structures — hash tables and trees morphing into each other, geometric shapes, dark academic aesthetic' },
        ],
      },
    ];
  },

  async uploadAsset(
    file: File,
    contentId: string,
    sceneId: string,
    onProgress?: (percent: number) => void,
  ): Promise<Asset> {
    // Simulate upload progress
    for (let p = 10; p <= 90; p += 20) {
      await mockDelay(300);
      onProgress?.(p);
    }
    await mockDelay(400);
    onProgress?.(100);

    const newAsset: Asset = {
      id: `asset-${Date.now()}`,
      filename: file.name,
      assetType: 'VIDEO',
      contentId,
      sceneId,
      durationSec: null,
      fileSizeBytes: file.size,
      mimeType: file.type,
      thumbnailUrl: null,
      url: URL.createObjectURL(file),
      metadata: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    _assets = [newAsset, ..._assets];
    return newAsset;
  },

  async getInboxAssets(): Promise<Asset[]> {
    await mockDelay(300);
    return _assets.filter((a) => a.contentId === null);
  },

  async uploadInboxAsset(
    file: File,
    metadata: Record<string, string> = {},
    onProgress?: (percent: number) => void,
  ): Promise<Asset> {
    for (let p = 15; p <= 85; p += 25) {
      await mockDelay(200);
      onProgress?.(p);
    }
    await mockDelay(300);
    onProgress?.(100);

    const isVideo = file.type.startsWith('video/') || file.name.endsWith('.mp4');
    const isImage = file.type.startsWith('image/');
    const isAudio = file.type.startsWith('audio/') || file.name.endsWith('.mp3');
    const isSub = file.name.endsWith('.srt') || file.name.endsWith('.vtt');

    const assetType = isVideo
      ? 'VIDEO'
      : isImage
      ? 'IMAGE'
      : isAudio
      ? 'AUDIO'
      : isSub
      ? 'SUBTITLE'
      : 'VIDEO';

    const newAsset: Asset = {
      id: `asset-${Date.now()}`,
      filename: file.name,
      assetType,
      contentId: null,
      sceneId: null,
      durationSec: isVideo ? 10 : null,
      fileSizeBytes: file.size,
      mimeType: file.type || 'video/mp4',
      thumbnailUrl: null,
      url: URL.createObjectURL(file),
      metadata: { generator: 'Google Flow / Manual Upload', ...metadata },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    _assets = [newAsset, ..._assets];
    return newAsset;
  },

  async assignAssetToScene(
    assetId: string,
    contentId: string,
    sceneId: string,
  ): Promise<Asset> {
    await mockDelay(300);
    const asset = _assets.find((a) => a.id === assetId);
    if (!asset) throw new Error(`Asset ${assetId} not found`);
    asset.contentId = contentId;
    asset.sceneId = sceneId;
    asset.updatedAt = new Date().toISOString();
    return { ...asset };
  },

  async deleteAsset(id: string): Promise<void> {
    await mockDelay(300);
    const exists = _assets.some((a) => a.id === id);
    if (!exists) throw new Error(`Asset ${id} not found`);
    _assets = _assets.filter((a) => a.id !== id);
  },

  async updateSceneAssetStatus(sceneId: string, status: SceneAssetStatus): Promise<void> {
    await mockDelay(200);
    console.info(`Scene ${sceneId} asset status → ${status}`);
  },
};
