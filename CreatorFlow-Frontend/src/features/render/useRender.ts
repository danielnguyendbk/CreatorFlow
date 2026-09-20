import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { renderApi } from '@/api';

export function useRenderJobs() {
  return useQuery({
    queryKey: ['renders'],
    queryFn: () => renderApi.getRenderJobs(),
  });
}

export function useRenderJob(id: string) {
  return useQuery({
    queryKey: ['render', id],
    queryFn: () => renderApi.getRenderJob(id),
    enabled: Boolean(id),
  });
}

export function useRenderLogs(id: string) {
  return useQuery({
    queryKey: ['render-logs', id],
    queryFn: () => renderApi.getRenderLogs(id),
    enabled: Boolean(id),
  });
}

export function useRetryRender() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => renderApi.retryRenderJob(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['renders'] });
    },
  });
}

export function useCancelRender() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => renderApi.cancelRenderJob(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['renders'] });
    },
  });
}
