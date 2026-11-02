import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workflowApi } from '@/api';

export function useWorkflows() {
  return useQuery({
    queryKey: ['workflows'],
    queryFn: () => workflowApi.getWorkflows(),
    refetchInterval: import.meta.env.VITE_API_BASE_URL ? 3000 : false,
  });
}

export function useWorkflow(id: string) {
  return useQuery({
    queryKey: ['workflow', id],
    queryFn: () => workflowApi.getWorkflow(id),
    enabled: Boolean(id),
    refetchInterval: import.meta.env.VITE_API_BASE_URL ? 3000 : false,
  });
}

export function useRetryWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workflowApi.retryWorkflow(id),
    onSuccess: (_, id) => {
      void qc.invalidateQueries({ queryKey: ['workflows'] });
      void qc.invalidateQueries({ queryKey: ['workflow', id] });
    },
  });
}

export function useCancelWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workflowApi.cancelWorkflow(id),
    onSuccess: (_, id) => {
      void qc.invalidateQueries({ queryKey: ['workflows'] });
      void qc.invalidateQueries({ queryKey: ['workflow', id] });
    },
  });
}

export function useResumeWorkflowInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => workflowApi.resumeWorkflow(id),
    onSuccess: (_, id) => {
      void qc.invalidateQueries({ queryKey: ['workflows'] });
      void qc.invalidateQueries({ queryKey: ['workflow', id] });
    },
  });
}
