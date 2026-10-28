'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, RefreshCw, Wifi, WifiOff, Database, Plus, X, Loader2 } from 'lucide-react';

interface RtdbSource {
  id: string;
  name: string;
  url: string;
  path: string;
}

interface RtdbDevice {
  id: string;
  sourceId: string;
  sourceName: string;
  name: string;
  model?: string;
  phone?: string;
  network?: string;
  battery?: number;
  android?: string;
  online: boolean;
}

function loadSources(): RtdbSource[] {
  try {
    const raw = localStorage.getItem('rtdb_sources');
    return raw ? (JSON.parse(raw) as RtdbSource[]) : [];
  } catch { return []; }
}

async function fetchSourceDevices(source: RtdbSource): Promise<RtdbDevice[]> {
  try {
    const base = source.url.replace(/\/$/, '');
    const path = (source.path || 'devices').replace(/^\/|\/$/g, '');
    const res = await fetch(`${base}/${path}.json`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json() as Record<string, unknown> | null;
    if (!data || typeof data !== 'object') return [];
    return Object.entries(data).map(([devId, raw]) => {
      const d = raw as Record<string, unknown>;
      const online =
        d['online'] === true || d['status'] === 'online' || d['connected'] === true;
      const battery =
        typeof d['battery'] === 'number'
          ? d['battery']
          : typeof d['batteryLevel'] === 'number'
          ? d['batteryLevel']
          : typeof d['bat'] === 'number'
          ? d['bat']
          : undefined;
      return {
        id: `${source.id}_${devId}`,
        sourceId: source.id,
        sourceName: source.name,
        name: String(d['name'] ?? d['model'] ?? d['device'] ?? devId),
        model: d['model'] ? String(d['model']) : d['device'] ? String(d['device']) : undefined,
        phone: d['phoneNumber']
          ? String(d['phoneNumber'])
          : d['phone']
          ? String(d['phone'])
          : d['number']
          ? String(d['number'])
          : d['sim']
          ? String(d['sim'])
          : undefined,
        network: d['network']
          ? String(d['network'])
          : d['networkType']
          ? String(d['networkType'])
          : d['operator']
          ? String(d['operator'])
          : undefined,
        battery,
        android: d['androidVersion']
          ? String(d['androidVersion'])
          : d['android']
          ? String(d['android'])
          : d['osVersion']
          ? String(d['osVersion'])
          : undefined,
        online,
      };
    });
  } catch { return []; }
}

export default function DevicesPage() {
  const [sources, setSources] = useState<RtdbSource[]>([]);
  const [devices, setDevices] = useState<RtdbDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all');

  // Quick-add URL form
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', url: '', path: 'devices' });
  const [addError, setAddError] = useState('');

  useEffect(() => {
    setSources(loadSources());
  }, []);

  const refresh = useCallback(async (srcs: RtdbSource[]) => {
    if (!srcs.length) return;
    setLoading(true);
    try {
      const results = await Promise.all(srcs.map(fetchSourceDevices));
      setDevices(results.flat());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(sources);
    const t = setInterval(() => refresh(sources), 30_000);
    return () => clearInterval(t);
  }, [sources, refresh]);

  function handleAdd() {
    if (!form.url.trim()) { setAddError('URL required'); return; }
    if (!form.url.startsWith('https://')) { setAddError('Must start with https://'); return; }
    const newSource: RtdbSource = {
      id: Date.now().toString(),
      name: form.name.trim() || new URL(form.url).hostname.split('.')[0],
      url: form.url.trim(),
      path: form.path.trim() || 'devices',
    };
    const updated = [...sources, newSource];
    localStorage.setItem('rtdb_sources', JSON.stringify(updated));
    setSources(updated);
    setForm({ name: '', url: '', path: 'devices' });
    setAddOpen(false);
    setAddError('');
  }

  function handleRemoveSource(id: string) {
    const updated = sources.filter((s) => s.id !== id);
    localStorage.setItem('rtdb_sources', JSON.stringify(updated));
    setSources(updated);
    setDevices((d) => d.filter((dev) => dev.sourceId !== id));
  }

  const filtered = devices.filter((d) => {
    const matchSearch =
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.phone ?? '').includes(search) ||
      (d.model ?? '').toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'all' ||
      (filter === 'online' && d.online) ||
      (filter === 'offline' && !d.online);
    return matchSearch && matchFilter;
  });

  const onlineCount = devices.filter((d) => d.online).length;
  const offlineCount = devices.filter((d) => !d.online).length;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Devices</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {devices.length} total · {onlineCount} online · {offlineCount} offline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refresh(sources)}
            disabled={loading || !sources.length}
            className="btn-secondary p-2"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => { setAddOpen(true); setAddError(''); }}
            className="btn-primary flex items-center gap-1.5 text-sm"
          >
            <Plus className="w-4 h-4" /> Add URL
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex gap-3">
        {[
          { label: 'TOTAL', val: devices.length, color: 'text-slate-700 dark:text-slate-200' },
          { label: 'ONLINE', val: onlineCount, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'OFFLINE', val: offlineCount, color: 'text-slate-400' },
          { label: 'SOURCES', val: sources.length, color: 'text-brand-600 dark:text-brand-400' },
        ].map(({ label, val, color }) => (
          <div key={label} className="card px-4 py-2 flex-1 text-center">
            <p className={`text-xl font-bold ${color}`}>{val}</p>
            <p className="text-xs text-slate-400 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Sources list */}
      {sources.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sources.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-brand-50 dark:bg-brand-950 border border-brand-200 dark:border-brand-800 text-xs text-brand-700 dark:text-brand-300"
            >
              <Database className="w-3 h-3" />
              <span className="font-medium">{s.name}</span>
              <button
                onClick={() => handleRemoveSource(s.id)}
                className="text-brand-400 hover:text-red-500 ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add URL form */}
      {addOpen && (
        <div className="card p-4 space-y-3 border-2 border-brand-200 dark:border-brand-800">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Add Firebase RTDB Source</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Name (optional)</label>
              <input
                className="input text-sm"
                placeholder="My Firebase"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">RTDB URL *</label>
              <input
                className="input text-sm font-mono"
                placeholder="https://my-project-default-rtdb.firebaseio.com"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Devices path</label>
              <input
                className="input text-sm font-mono"
                placeholder="devices"
                value={form.path}
                onChange={(e) => setForm((f) => ({ ...f, path: e.target.value }))}
              />
            </div>
          </div>
          {addError && <p className="text-xs text-red-500">{addError}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setAddOpen(false)} className="btn-secondary text-sm py-1.5 px-3">Cancel</button>
            <button onClick={handleAdd} className="btn-primary text-sm py-1.5 px-3">Add & Load</button>
          </div>
        </div>
      )}

      {/* Search + filter */}
      {devices.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="search"
              placeholder="Search by name or phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>
          <div className="flex gap-1.5">
            {(['all', 'online', 'offline'] as const).map((f) => (
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

      {/* Empty state */}
      {!sources.length && !loading && (
        <div className="card p-12 text-center space-y-4">
          <Database className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
          <div>
            <p className="text-slate-700 dark:text-slate-300 font-medium">No RTDB sources added</p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              Click &quot;Add URL&quot; and paste your Firebase RTDB URL to see devices
            </p>
          </div>
          <button
            onClick={() => { setAddOpen(true); setAddError(''); }}
            className="btn-primary mx-auto"
          >
            <Plus className="w-4 h-4" /> Add Firebase URL
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !devices.length && (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4 space-y-3 animate-pulse">
              <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded w-3/4" />
              <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded w-1/2" />
              <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {/* Device cards */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((device) => (
            <div
              key={device.id}
              className={`card p-3 space-y-2 border ${
                device.online
                  ? 'border-emerald-200 dark:border-emerald-800'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              {/* Name + status */}
              <div className="flex items-start justify-between gap-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight line-clamp-1">
                  {device.name}
                </p>
                <div className="flex-shrink-0">
                  {device.online ? (
                    <Wifi className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <WifiOff className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </div>

              {/* Status + source */}
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${device.online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                <span className={`text-xs font-medium ${device.online ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                  {device.online ? 'Online' : 'Offline'}
                </span>
                <span className="text-xs text-slate-300 dark:text-slate-600">·</span>
                <span className="text-xs text-slate-400 truncate">{device.sourceName}</span>
              </div>

              {/* Details */}
              <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-700/50">
                {device.model && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">MODEL</span>
                    <span className="text-slate-600 dark:text-slate-300 font-mono text-right line-clamp-1 max-w-[120px]">{device.model}</span>
                  </div>
                )}
                {device.android && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">ANDROID</span>
                    <span className="text-slate-600 dark:text-slate-300">v{device.android}</span>
                  </div>
                )}
                {device.battery != null && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">BATTERY</span>
                    <span className={`font-medium ${device.battery > 30 ? 'text-emerald-500' : device.battery > 10 ? 'text-amber-500' : 'text-red-500'}`}>
                      {device.battery}%
                    </span>
                  </div>
                )}
                {device.phone && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">NUMBER</span>
                    <span className="text-slate-600 dark:text-slate-300 font-mono">{device.phone}</span>
                  </div>
                )}
                {device.network && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">NETWORK</span>
                    <span className="text-slate-600 dark:text-slate-300">{device.network}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No results after filter */}
      {sources.length > 0 && !loading && devices.length > 0 && filtered.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">No devices match your search</div>
      )}

      {/* Sources loaded but no devices found */}
      {sources.length > 0 && !loading && devices.length === 0 && (
        <div className="card p-8 text-center text-slate-400 text-sm space-y-2">
          <p>No devices found in your RTDB sources.</p>
          <p className="text-xs">Make sure your devices path is correct (default: <code className="font-mono">devices</code>)</p>
          <p className="text-xs">And that RTDB rules allow read: <code className="font-mono">{'.read: true'}</code></p>
        </div>
      )}
    </div>
  );
}
