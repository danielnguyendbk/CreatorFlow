import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  sidebarCollapsed: boolean;
  theme: 'dark' | 'light';
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      theme: 'dark',

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      setSidebarCollapsed: (collapsed) =>
        set({ sidebarCollapsed: collapsed }),

      setTheme: (theme) => set({ theme }),

      toggleTheme: () =>
        set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
    }),
    {
      name: 'creatorflow-ui',
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed, theme: s.theme }),
    },
  ),
);
