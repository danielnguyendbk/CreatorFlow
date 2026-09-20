import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  contentApi,
  storyboardApi,
  assetApi,
  renderApi,
  publicationApi,
  activityApi,
} from '@/api';
import type { ContentStatus, Scene, SceneAssetStatus, WorkflowStage } from '@/types';

export function useContents() {
  return useQuery({
    queryKey: ['contents'],
    queryFn: () => contentApi.getContents(),
  });
}

export function useContent(id: string) {
  return useQuery({
    queryKey: ['content', id],
    queryFn: () => contentApi.getContent(id),
    enabled: Boolean(id),
  });
}

export function useUpdateContentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ContentStatus }) =>
      contentApi.updateContentStatus(id, status),
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({ queryKey: ['contents'] });
      void qc.invalidateQueries({ queryKey: ['content', variables.id] });
    },
  });
}

export function useRetryStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: WorkflowStage }) =>
      contentApi.retryStage(id, stage),
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({ queryKey: ['contents'] });
      void qc.invalidateQueries({ queryKey: ['content', variables.id] });
    },
  });
}

export function useResumeWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => contentApi.resumeWorkflow(id),
    onSuccess: (_, id) => {
      void qc.invalidateQueries({ queryKey: ['contents'] });
      void qc.invalidateQueries({ queryKey: ['content', id] });
    },
  });
}

export function useStoryboard(contentId: string) {
  return useQuery({
    queryKey: ['storyboard', contentId],
    queryFn: () => storyboardApi.getStoryboardByContent(contentId),
    enabled: Boolean(contentId),
  });
}

export function useUpdateScene() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      storyboardId,
      sceneId,
      updates,
    }: {
      storyboardId: string;
      sceneId: string;
      contentId: string;
      updates: Partial<Scene>;
    }) => storyboardApi.updateScene(storyboardId, sceneId, updates),
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({ queryKey: ['storyboard', variables.contentId] });
    },
  });
}

export function useUploadSceneClip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      contentId,
      storyboardId,
      sceneId,
      onProgress,
    }: {
      file: File;
      contentId: string;
      storyboardId: string;
      sceneId: string;
      onProgress?: (percent: number) => void;
    }) => {
      // 1. Set scene assetStatus to UPLOADING
      await storyboardApi.updateScene(storyboardId, sceneId, {
        assetStatus: 'UPLOADING' as SceneAssetStatus,
      });
      void qc.invalidateQueries({ queryKey: ['storyboard', contentId] });

      // 2. Upload asset with simulated progress
      const asset = await assetApi.uploadAsset(file, contentId, sceneId, onProgress);

      // 3. Mark scene as READY with assetId
      const updatedSb = await storyboardApi.updateScene(storyboardId, sceneId, {
        assetStatus: 'READY' as SceneAssetStatus,
        assetId: asset.id,
      });

      // 4. Check if any scenes are still waiting
      const remainingPending = updatedSb.scenes.filter(
        (s) => s.assetStatus === 'WAITING_FOR_ASSET',
      );
      if (remainingPending.length === 0) {
        // If all scenes ready, resume workflow
        await contentApi.resumeWorkflow(contentId);
      }

      return { asset, storyboard: updatedSb };
    },
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({ queryKey: ['storyboard', variables.contentId] });
      void qc.invalidateQueries({ queryKey: ['assets', 'content', variables.contentId] });
      void qc.invalidateQueries({ queryKey: ['contents'] });
      void qc.invalidateQueries({ queryKey: ['content', variables.contentId] });
    },
  });
}

export function useContentAssets(contentId: string) {
  return useQuery({
    queryKey: ['assets', 'content', contentId],
    queryFn: () => assetApi.getAssetsByContent(contentId),
    enabled: Boolean(contentId),
  });
}

export function useContentRenderJobs(contentId: string) {
  return useQuery({
    queryKey: ['renders'],
    queryFn: () => renderApi.getRenderJobs(),
    select: (jobs) => jobs.filter((j) => j.contentId === contentId),
  });
}

export function useContentPublications(contentId: string) {
  return useQuery({
    queryKey: ['publications'],
    queryFn: () => publicationApi.getPublications(),
    select: (pubs) => pubs.filter((p) => p.contentId === contentId),
  });
}

export function useContentActivity(contentId: string) {
  return useQuery({
    queryKey: ['activity', 'content', contentId],
    queryFn: () => activityApi.getEventsByEntity(contentId),
    enabled: Boolean(contentId),
  });
}
