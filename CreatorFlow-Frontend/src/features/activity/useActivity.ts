import { useQuery } from '@tanstack/react-query';
import { activityApi } from '@/api';

export function useActivityEvents(limit = 100) {
  return useQuery({
    queryKey: ['activity', limit],
    queryFn: () => activityApi.getEvents(limit),
  });
}
