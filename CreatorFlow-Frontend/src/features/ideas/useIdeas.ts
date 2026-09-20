import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ideaApi } from '@/api';
import type { IdeaStatus } from '@/types';

export function useIdeas() {
  return useQuery({
    queryKey: ['ideas'],
    queryFn: () => ideaApi.getIdeas(),
  });
}

export function useUpdateIdeaStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: IdeaStatus }) =>
      ideaApi.updateIdeaStatus(id, status),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ideas'] });
    },
  });
}

export function useGenerateIdeas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      niche: string;
      language: string;
      count: number;
      targetDurationSec: number;
      style: string;
    }) => ideaApi.generateIdeas(params),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ideas'] });
    },
  });
}
