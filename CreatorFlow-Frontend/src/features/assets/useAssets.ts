import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetApi, storyboardApi, contentApi } from '@/api';
import type { SceneAssetStatus } from '@/types';

export function useAssets() {
  return useQuery({
    queryKey: ['assets'],
    queryFn: () => assetApi.getAssets(),
  });
}

export function useAsset(id: string) {
  return useQuery({
    queryKey: ['asset', id],
    queryFn: () => assetApi.getAsset(id),
    enabled: Boolean(id),
  });
}

export function useInboxAssets() {
  return useQuery({
    queryKey: ['assets', 'inbox'],
    queryFn: () => assetApi.getInboxAssets(),
  });
}

export function usePendingFlowScenes() {
  return useQuery({
    queryKey: ['assets', 'pending-flow'],
    queryFn: () => assetApi.getPendingFlowScenes(),
  });
}

export function useUploadInboxAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      metadata,
      onProgress,
    }: {
      file: File;
      metadata?: Record<string, string>;
      onProgress?: (percent: number) => void;
    }) => assetApi.uploadInboxAsset(file, metadata, onProgress),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assets'] });
      void qc.invalidateQueries({ queryKey: ['assets', 'inbox'] });
    },
  });
}

export function useAssignAssetToScene() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      assetId,
      contentId,
      sceneId,
      storyboardId,
    }: {
      assetId: string;
      contentId: string;
      sceneId: string;
      storyboardId?: string;
    }) => {
      // 1. Assign asset in asset store
      const updatedAsset = await assetApi.assignAssetToScene(assetId, contentId, sceneId);

      // 2. If storyboardId provided or known, update storyboard scene status to READY
      if (storyboardId) {
        const updatedSb = await storyboardApi.updateScene(storyboardId, sceneId, {
          assetStatus: 'READY' as SceneAssetStatus,
          assetId,
        });

        // 3. If no more pending scenes in storyboard, resume workflow
        const remainingPending = updatedSb.scenes.filter(
          (s) => s.assetStatus === 'WAITING_FOR_ASSET',
        );
        if (remainingPending.length === 0) {
          await contentApi.resumeWorkflow(contentId);
        }
      }

      return updatedAsset;
    },
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({ queryKey: ['assets'] });
      void qc.invalidateQueries({ queryKey: ['assets', 'inbox'] });
      void qc.invalidateQueries({ queryKey: ['assets', 'pending-flow'] });
      void qc.invalidateQueries({ queryKey: ['storyboard', variables.contentId] });
      void qc.invalidateQueries({ queryKey: ['content', variables.contentId] });
      void qc.invalidateQueries({ queryKey: ['contents'] });
    },
  });
}

export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => assetApi.deleteAsset(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['assets'] });
      void qc.invalidateQueries({ queryKey: ['assets', 'inbox'] });
    },
  });
}
