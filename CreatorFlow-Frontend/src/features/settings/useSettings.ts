import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { settingsApi } from '@/api';
import type { SystemSettings } from '@/types';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.getSettings(),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (partial: Partial<SystemSettings>) => settingsApi.updateSettings(partial),
    onSuccess: (updated) => {
      qc.setQueryData(['settings'], updated);
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}
