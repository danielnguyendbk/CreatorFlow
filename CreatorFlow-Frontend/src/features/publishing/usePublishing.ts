import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { publicationApi } from '@/api';
import type { PublicationJob } from '@/types';

export function usePublications() {
  return useQuery({
    queryKey: ['publications'],
    queryFn: () => publicationApi.getPublications(),
  });
}

export function usePublication(id: string) {
  return useQuery({
    queryKey: ['publication', id],
    queryFn: () => publicationApi.getPublication(id),
    enabled: Boolean(id),
  });
}

export function useRetryPublication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => publicationApi.retryPublication(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['publications'] });
    },
  });
}

export function usePublishNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => publicationApi.publishNow(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['publications'] });
    },
  });
}

export function useUpdatePublicationDetails() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<PublicationJob, 'title' | 'caption' | 'hashtags' | 'scheduledAt'>>;
    }) => publicationApi.updatePublicationDetails(id, updates),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['publications'] });
    },
  });
}
