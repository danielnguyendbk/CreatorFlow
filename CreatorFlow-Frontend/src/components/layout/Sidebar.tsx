import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Lightbulb,
  FileVideo,
  FolderOpen,
  Workflow,
  ListVideo,
  Send,
  Activity,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
  Circle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUiStore } from '@/stores/uiStore';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: 'Main',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Content',
    items: [
      { label: 'Ideas', href: '/ideas', icon: Lightbulb },
      { label: 'Contents', href: '/contents', icon: FileVideo },
      { label: 'Assets', href: '/assets', icon: FolderOpen },
    ],
  },
  {
    title: 'Operations',
    items: [
      { label: 'Workflows', href: '/workflows', icon: Workflow },
      { label: 'Render Queue', href: '/render-queue', icon: ListVideo },
      { label: 'Publication Queue', href: '/publication-queue', icon: Send },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Activity', href: '/activity', icon: Activity },
      { label: 'Settings', href: '/settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);
  const location = useLocation();

  return (
    <aside
      className={cn(
        'relative flex h-full flex-col border-r border-zinc-800 bg-zinc-950 transition-all duration-300',
        collapsed ? 'w-[60px]' : 'w-[220px]',
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          'flex h-14 items-center border-b border-zinc-800 px-4',
          collapsed ? 'justify-center' : 'gap-2.5',
        )}
      >
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-600">
          <Zap className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight text-zinc-100">
            CreatorFlow
          </span>
        )}
      </div>

      {/* Nav Groups */}
      <nav className="flex-1 overflow-y-auto py-3" aria-label="Main navigation">
        {navGroups.map((group) => (
          <div key={group.title} className="mb-4">
            {!collapsed && (
              <p className="mb-1 px-4 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                {group.title}
              </p>
            )}
            <ul role="list" className="space-y-0.5 px-2">
              {group.items.map((item) => {
                const isActive =
                  location.pathname === item.href ||
                  (item.href !== '/dashboard' && location.pathname.startsWith(item.href));

                return (
                  <li key={item.href}>
                    <NavLink
                      to={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                        collapsed && 'justify-center px-0',
                        isActive
                          ? 'bg-zinc-800 text-zinc-100'
                          : 'text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300',
                      )}
                    >
                      <item.icon
                        className={cn(
                          'h-4 w-4 shrink-0',
                          isActive ? 'text-brand-400' : 'text-current',
                        )}
                      />
                      {!collapsed && item.label}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Bottom: Status + User */}
      <div className="border-t border-zinc-800 p-3">
        {!collapsed && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2">
            <Circle className="h-2 w-2 fill-emerald-500 text-emerald-500" />
            <span className="text-xs text-zinc-500">System OK</span>
          </div>
        )}
        <div
          className={cn(
            'flex items-center gap-2.5 rounded-lg px-2.5 py-2',
            collapsed && 'justify-center px-0',
          )}
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-semibold text-zinc-400 ring-1 ring-zinc-700">
            U
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="truncate text-xs font-medium text-zinc-300">User</span>
              <span className="truncate text-[10px] text-zinc-600">Single user</span>
            </div>
          )}
        </div>
      </div>

      {/* Collapse Toggle */}
      <button
        onClick={toggleSidebar}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-16 flex h-6 w-6 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-500 shadow-md hover:bg-zinc-800 hover:text-zinc-300 transition-colors z-10"
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </button>
    </aside>
  );
}
