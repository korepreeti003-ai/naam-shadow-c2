'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Settings, LogOut, Smartphone, Wifi } from 'lucide-react';
import { useAuth } from './auth-provider';
import { getClientAuthInstance, firebaseSignOut } from '@/lib/firebase-client';

const NAV = [
  { href: '/dashboard', icon: Wifi, label: 'Connection' },
  { href: '/devices', icon: Smartphone, label: 'Devices' },
  { href: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const pathname = usePathname();

  async function handleSignOut() {
    await firebaseSignOut(getClientAuthInstance());
    window.location.href = '/login';
  }

  return (
    <aside className="h-screen w-16 flex flex-col bg-slate-900 border-r border-slate-800 z-30 flex-shrink-0">
      {/* Logo */}
      <div className="h-16 flex items-center justify-center border-b border-slate-800">
        <div className="w-9 h-9 rounded-full border border-emerald-500/40 bg-slate-800 flex items-center justify-center relative">
          <div className="absolute inset-0 rounded-full bg-emerald-500/10 blur-sm" />
          <span className="relative text-sm font-black text-emerald-400">A</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col items-center py-4 gap-1">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link key={href} href={href} title={label}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                active
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
              }`}>
              <Icon className="w-5 h-5" />
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="flex flex-col items-center pb-4 border-t border-slate-800 pt-4">
        <button onClick={handleSignOut} title="Sign out"
          className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </aside>
  );
}
