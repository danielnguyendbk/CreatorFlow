import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useNotificationStore, type Notification } from '@/stores/notificationStore';
import { cn } from '@/lib/utils';

const iconMap = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const colorMap = {
  success: 'bg-emerald-950 border-emerald-800 text-emerald-400',
  error: 'bg-red-950 border-red-800 text-red-400',
  warning: 'bg-amber-950 border-amber-800 text-amber-400',
  info: 'bg-blue-950 border-blue-800 text-blue-400',
};

function Toast({ n }: { n: Notification }) {
  const remove = useNotificationStore((s) => s.remove);
  const Icon = iconMap[n.type];

  return (
    <div
      className={cn(
        'pointer-events-auto flex w-80 items-start gap-3 rounded-xl border p-4 shadow-xl shadow-black/40 animate-slide-in',
        colorMap[n.type],
      )}
      role="alert"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-100">{n.title}</p>
        {n.message && <p className="mt-0.5 text-xs text-zinc-400 leading-snug">{n.message}</p>}
      </div>
      <button
        onClick={() => remove(n.id)}
        className="shrink-0 rounded p-0.5 hover:bg-white/10 transition-colors"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5 text-zinc-400" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const notifications = useNotificationStore((s) => s.notifications);

  if (notifications.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col gap-2"
    >
      {notifications.map((n) => (
        <Toast key={n.id} n={n} />
      ))}
    </div>
  );
}
