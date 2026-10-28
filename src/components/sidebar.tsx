'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Smartphone,
  Settings,
  LogOut,
  Radio,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  Monitor,
} from 'lucide-react';
import { useAuth } from './auth-provider';
import { useTheme } from './theme-provider';
import { getClientAuthInstance, firebaseSignOut } from '@/lib/firebase-client';
import { useState } from 'react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/devices', label: 'Devices', icon: Smartphone },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, appUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);

  async function handleSignOut() {
    await firebaseSignOut(getClientAuthInstance());
    window.location.href = '/login';
  }

  function cycleTheme() {
    const order: typeof theme[] = ['light', 'dark', 'system'];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
  }

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;

  return (
    <aside
      className={cn(
        'h-screen flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-300 z-30',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex items-center gap-3 px-4 h-16 border-b border-slate-200 dark:border-slate-800">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
          <Radio className="w-4 h-4 text-white" />
        </div>
        {!collapsed && (
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white leading-none">
              Shadow C2
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-none mt-0.5">
              SMS Dashboard
            </p>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors group',
                active
                  ? 'bg-brand-50 dark:bg-brand-950 text-brand-700 dark:text-brand-300'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              )}
              title={collapsed ? label : undefined}
            >
              <Icon
                className={cn(
                  'w-5 h-5 flex-shrink-0',
                  active
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200'
                )}
              />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      <div className="px-2 py-4 border-t border-slate-200 dark:border-slate-800 space-y-0.5">
        <button
          onClick={cycleTheme}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={collapsed ? 'Toggle theme' : undefined}
        >
          <ThemeIcon className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Theme: {theme}</span>}
        </button>

        {user && (
          <div
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg',
              collapsed ? 'justify-center' : ''
            )}
          >
            <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900 flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-brand-700 dark:text-brand-300">
                {(user.email ?? 'U')[0].toUpperCase()}
              </span>
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-slate-900 dark:text-white truncate">
                  {appUser?.displayName ?? user.email}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                  {appUser?.role ?? 'panel'}
                </p>
              </div>
            )}
            <button
              onClick={handleSignOut}
              className="p-1 rounded text-slate-400 hover:text-red-500 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
