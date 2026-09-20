import { useQuery } from '@tanstack/react-query';
import { contentApi } from '@/api';

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => contentApi.getDashboardStats(),
  });
}

export function useRecentContents() {
  return useQuery({
    queryKey: ['contents'],
    queryFn: () => contentApi.getContents(),
    select: (data) =>
      [...data]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 8),
  });
}
