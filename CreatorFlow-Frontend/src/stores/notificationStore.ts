import { create } from 'zustand';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number; // ms, default 4000
}

interface NotificationState {
  notifications: Notification[];
  add: (n: Omit<Notification, 'id'>) => string;
  remove: (id: string) => void;
  clear: () => void;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  notifications: [],

  add: (n) => {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    set((s) => ({ notifications: [...s.notifications, { ...n, id }] }));

    // Auto-dismiss
    const duration = n.duration ?? 4000;
    if (duration > 0) {
      setTimeout(() => {
        set((s) => ({ notifications: s.notifications.filter((x) => x.id !== id) }));
      }, duration);
    }

    return id;
  },

  remove: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),

  clear: () => set({ notifications: [] }),
}));

/** Convenience helpers */
export const notify = {
  success: (title: string, message?: string) =>
    useNotificationStore.getState().add({ type: 'success', title, message }),
  error: (title: string, message?: string) =>
    useNotificationStore.getState().add({ type: 'error', title, message }),
  warning: (title: string, message?: string) =>
    useNotificationStore.getState().add({ type: 'warning', title, message }),
  info: (title: string, message?: string) =>
    useNotificationStore.getState().add({ type: 'info', title, message }),
};
