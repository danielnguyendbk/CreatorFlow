import { useLocation } from 'react-router-dom';
import { Bell, Plus, Search, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useUiStore } from '@/stores/uiStore';

const routeTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/ideas': 'Idea Backlog',
  '/contents': 'Contents',
  '/assets': 'Asset Library',
  '/assets/inbox': 'Flow Asset Inbox',
  '/workflows': 'Workflows',
  '/render-queue': 'Render Queue',
  '/publication-queue': 'Publication Queue',
  '/activity': 'Activity',
  '/settings': 'Settings',
};

function getPageTitle(pathname: string): string {
  // Exact match first
  if (routeTitles[pathname]) return routeTitles[pathname];
  // Dynamic routes
  if (pathname.startsWith('/contents/')) return 'Content Detail';
  if (pathname.startsWith('/workflows/')) return 'Workflow Detail';
  return 'CreatorFlow';
}

export function Topbar() {
  const location = useLocation();
  const title = getPageTitle(location.pathname);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-6 backdrop-blur-sm">
      {/* Page title */}
      <h2 className="text-sm font-semibold text-zinc-100">{title}</h2>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Search placeholder */}
        <button
          id="global-search-btn"
          className="flex h-8 w-52 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-xs text-zinc-600 transition-colors hover:border-zinc-700 hover:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          aria-label="Search (coming soon)"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span>Search…</span>
          <kbd className="ml-auto hidden rounded border border-zinc-800 px-1 py-0.5 text-[10px] text-zinc-700 sm:block">
            ⌘K
          </kbd>
        </button>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          id="theme-toggle-btn"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>

        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Notifications"
          id="notifications-btn"
          className="relative"
        >
          <Bell className="h-4 w-4" />
          {/* Notification dot */}
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-brand-500" />
        </Button>

        {/* New Content */}
        <Button
          variant="brand"
          size="sm"
          leftIcon={Plus}
          id="new-content-btn"
        >
          New Content
        </Button>
      </div>
    </header>
  );
}
