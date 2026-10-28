'use client';

import { useEffect, useState, useCallback } from 'react';
import { Wifi, WifiOff, RefreshCw, Settings, Smartphone, Activity, Zap, MessageSquare } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import Link from 'next/link';

interface QuickDevice {
  id: string;
  name: string;
  online: boolean;
  battery?: number;
  phone?: string;
  network?: string;
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
  for (const k of ['online','Online','isOnline','connected','Connected','active','Active','isActive','isConnected'])
    if (raw[k] === true) return true;
  for (const k of ['online','Online','isOnline','connected','active','status','Status','state']) {
    const v = String(raw[k] ?? '').toLowerCase();
    if (['true','1','yes','online','connected','active'].includes(v)) return true;
  }
  for (const k of ['lastSeen','LastSeen','updatedAt','lastActive','timestamp','time','lastOnline']) {
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
    const phoneKeys = ['phoneNumber','PhoneNumber','number','phone','mobile','mobNo','subscriberId'];
    const opKeys = ['operator','Operator','provider','Provider','carrier','network','Network'];
    for (const k of phoneKeys) if (s0?.[k] && !flat['phoneNumber']) flat['phoneNumber'] = s0[k];
    for (const k of opKeys) if (s0?.[k] && !flat['operator']) flat['operator'] = s0[k];
  }
  const nets = raw['networks'] ?? raw['Networks'];
  if (Array.isArray(nets) && nets.length > 0 && !flat['provider']) flat['provider'] = String(nets[0]);

  const online = isOnlineRaw(raw) || isOnlineRaw(flat);
  const brand = toStr(firstVal(flat, ['Brand','brand']));
  const model = toStr(firstVal(flat, ['modelName','model','Model','deviceModel','Device']));
  const name = brand && model && !model.toLowerCase().startsWith(brand.toLowerCase())
    ? `${brand} ${model}` : (model || brand || id.slice(0, 12));

  return {
    id, name, online,
    battery: toNum(firstVal(flat, ['batteryPercent','battery','Battery','batteryLevel','level','charge','percentage'])),
    phone: toStr(firstVal(flat, ['mobNo','MobNo','phoneNumber','PhoneNumber','phone','mobile','number'])) || undefined,
    network: toStr(firstVal(flat, ['provider','Provider','network','Network','operator','Operator','carrier'])) || undefined,
    lastSeen: toNum(firstVal(flat, ['lastSeen','LastSeen','updatedAt','timestamp','time','lastActive'])),
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

async function adminWrite(path: string, method: string, data: unknown): Promise<boolean> {
  try {
    const url = loadStr('panel_rtdb_url');
    const saRaw = loadStr('panel_service_account');
    if (!url) return false;
    const res = await fetch('/api/admin-rtdb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serviceAccount: saRaw ? JSON.parse(saRaw) : undefined, rtdbUrl: url, path, method, data }),
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json() as { error?: string };
    return !json.error;
  } catch { return false; }
}

export default function ConnectionPage() {
  const { idToken } = useAuth();
  const [devices, setDevices] = useState<QuickDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [pingState, setPingState] = useState<Record<string, 'idle' | 'pinging' | 'done'>>({});

  const fetchDevices = useCallback(async () => {
    const url = loadStr('panel_rtdb_url');
    const saRaw = loadStr('panel_service_account');
    if (!url) { setConnected(false); return; }
    setLoading(true);
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
        if (json.error) { setConnected(false); return; }
        data = json.data;
      } else if (idToken) {
        const res = await fetch(`${url.replace(/\/$/, '')}/clients.json?auth=${idToken}`, {
          cache: 'no-store', signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) { setConnected(false); return; }
        data = await res.json();
      } else return;

      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const parsed = Object.entries(data as Record<string, unknown>)
          .filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v))
          .map(([id, raw]) => parseQuick(id, raw as Record<string, unknown>))
          .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
        setDevices(parsed);
        setConnected(true);
      } else {
        setDevices([]);
        setConnected(true);
      }
      setLastUpdated(new Date());
    } catch {
      setConnected(false);
    } finally { setLoading(false); }
  }, [idToken]);

  useEffect(() => {
    fetchDevices();
    const t = setInterval(fetchDevices, 30_000);
    return () => clearInterval(t);
  }, [fetchDevices]);

  async function pingDevice(id: string) {
    setPingState(p => ({ ...p, [id]: 'pinging' }));
    await adminWrite(`/clients/${id}/ping`, 'PUT', { timestamp: Date.now(), pingedAt: Date.now(), ping: true });
    setPingState(p => ({ ...p, [id]: 'done' }));
    setTimeout(() => setPingState(p => ({ ...p, [id]: 'idle' })), 2500);
  }

  const onlineDevices = devices.filter(d => d.online);
  const offlineDevices = devices.filter(d => !d.online);
  const rtdbUrl = loadStr('panel_rtdb_url');
  const isConfigured = !!rtdbUrl;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-black text-white tracking-tight">Connection</h1>
          {lastUpdated && (
            <p className="text-xs text-slate-500 mt-0.5">Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</p>
          )}
        </div>
        <button onClick={fetchDevices} disabled={loading}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Not configured */}
      {!isConfigured && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full border border-slate-700 bg-slate-900 flex items-center justify-center mb-5">
            <Settings className="w-7 h-7 text-slate-500" />
          </div>
          <p className="text-slate-200 font-semibold text-lg mb-2">Firebase Not Connected</p>
          <p className="text-sm text-slate-500 mb-6 max-w-xs">Settings mein google-services.json aur service account add karo</p>
          <Link href="/settings"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold text-sm transition-colors">
            <Settings className="w-4 h-4" /> Open Settings
          </Link>
        </div>
      )}

      {isConfigured && (
        <>
          {/* Connection Status Banner */}
          <div className={`rounded-2xl border p-5 mb-5 flex items-center gap-4 ${
            connected === null
              ? 'border-slate-700 bg-slate-900'
              : connected
                ? 'border-emerald-700/50 bg-emerald-950/30'
                : 'border-red-700/40 bg-red-950/20'
          }`}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
              connected === null ? 'bg-slate-800' : connected ? 'bg-emerald-500/20' : 'bg-red-500/10'
            }`}>
              {connected === null ? (
                <RefreshCw className="w-5 h-5 text-slate-500 animate-spin" />
              ) : connected ? (
                <Wifi className="w-5 h-5 text-emerald-400" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`font-bold text-base ${
                connected === null ? 'text-slate-400' : connected ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {connected === null ? 'Connecting…' : connected ? 'Firebase Connected' : 'Connection Failed'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{rtdbUrl}</p>
            </div>
            {connected && (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs text-emerald-400 font-medium">LIVE</span>
              </div>
            )}
          </div>

          {/* Stat Cards */}
          {connected && (
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-white">{devices.length}</p>
                <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase mt-1">Total</p>
              </div>
              <div className="bg-slate-900 border border-emerald-700/40 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-emerald-400">{onlineDevices.length}</p>
                <p className="text-[10px] text-emerald-600 font-bold tracking-widest uppercase mt-1">Online</p>
              </div>
              <div className="bg-slate-900 border border-red-800/30 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-red-400">{offlineDevices.length}</p>
                <p className="text-[10px] text-red-700 font-bold tracking-widest uppercase mt-1">Offline</p>
              </div>
            </div>
          )}

          {/* Online Devices */}
          {connected && onlineDevices.length > 0 && (
            <div className="bg-slate-900 border border-slate-700/50 rounded-xl overflow-hidden mb-4">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/40">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <p className="text-sm font-bold text-emerald-400">Online Devices</p>
                <span className="ml-auto text-xs text-slate-500">{onlineDevices.length}</span>
              </div>
              <div className="divide-y divide-slate-700/30">
                {onlineDevices.map(d => (
                  <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                    <Link href={`/devices/${d.id}`} className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center flex-shrink-0">
                        <Smartphone className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-100 truncate">{d.name}</p>
                        <p className="text-xs text-slate-500 truncate">{d.phone || d.network || d.id.slice(0, 16)}</p>
                      </div>
                      {d.battery != null && (
                        <span className={`text-xs font-bold flex-shrink-0 ${d.battery > 50 ? 'text-emerald-400' : d.battery > 20 ? 'text-amber-400' : 'text-red-400'}`}>
                          {d.battery}%
                        </span>
                      )}
                    </Link>
                    {/* Quick control buttons */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => pingDevice(d.id)}
                        disabled={pingState[d.id] === 'pinging'}
                        title="Ping device"
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                          pingState[d.id] === 'done'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : pingState[d.id] === 'pinging'
                              ? 'bg-slate-700 text-slate-500'
                              : 'bg-slate-700/60 text-slate-400 hover:bg-slate-700 hover:text-amber-400'
                        }`}>
                        <Zap className={`w-3.5 h-3.5 ${pingState[d.id] === 'pinging' ? 'animate-pulse' : ''}`} />
                      </button>
                      <Link href={`/devices/${d.id}#sms`} title="Send SMS"
                        className="w-7 h-7 rounded-lg bg-slate-700/60 flex items-center justify-center text-slate-400 hover:bg-teal-500/20 hover:text-teal-400 transition-colors">
                        <MessageSquare className="w-3.5 h-3.5" />
                      </Link>
                      <Activity className="w-3.5 h-3.5 text-emerald-400 ml-0.5" />
                    </div>
                  </div>
                ))}
              </div>
              {onlineDevices.length < devices.length && (
                <Link href="/devices" className="block px-4 py-3 text-center text-xs text-slate-500 hover:text-slate-300 border-t border-slate-700/40 transition-colors">
                  View all {devices.length} devices →
                </Link>
              )}
            </div>
          )}

          {/* Offline Devices */}
          {connected && offlineDevices.length > 0 && (
            <div className="bg-slate-900 border border-slate-700/30 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/40">
                <span className="w-2 h-2 rounded-full bg-slate-600" />
                <p className="text-sm font-bold text-slate-400">Offline</p>
                <span className="ml-auto text-xs text-slate-600">{offlineDevices.length}</span>
              </div>
              <div className="divide-y divide-slate-700/20">
                {offlineDevices.slice(0, 10).map(d => (
                  <Link key={d.id} href={`/devices/${d.id}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-800/30 transition-colors">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-400 truncate">{d.name}</p>
                      <p className="text-xs text-slate-600 truncate">{d.phone || d.id.slice(0, 16)}</p>
                    </div>
                    {d.lastSeen && (
                      <span className="text-[10px] text-slate-600 flex-shrink-0">{timeAgo(d.lastSeen)}</span>
                    )}
                  </Link>
                ))}
                {offlineDevices.length > 10 && (
                  <Link href="/devices" className="block px-4 py-3 text-center text-xs text-slate-600 hover:text-slate-400 border-t border-slate-700/30 transition-colors">
                    +{offlineDevices.length - 10} more →
                  </Link>
                )}
              </div>
            </div>
          )}

          {connected && devices.length === 0 && !loading && (
            <div className="text-center py-16">
              <Smartphone className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500">No devices registered yet</p>
              <p className="text-xs text-slate-600 mt-1">/clients path is empty in Firebase</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
