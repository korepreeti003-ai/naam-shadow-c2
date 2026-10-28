'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, RefreshCw, Wifi, WifiOff, Database, Plus, X, Loader2, CheckCircle, AlertCircle, ChevronDown } from 'lucide-react';

interface RtdbSource {
  id: string;
  name: string;
  url: string;
}

interface RtdbDevice {
  id: string;
  sourceId: string;
  sourceName: string;
  displayName: string;
  online: boolean;
  rawFields: Record<string, string | number | boolean>;
}

// Known field name aliases → canonical key
const FIELD_MAP: Record<string, string> = {
  // model / device name
  model: 'model', Model: 'model', deviceModel: 'model', DeviceModel: 'model',
  device: 'model', Device: 'model', phoneModel: 'model',
  // brand
  brand: 'brand', Brand: 'brand',
  // android version
  version: 'android', Version: 'android', androidVersion: 'android',
  AndroidVersion: 'android', android: 'android', Android: 'android',
  osVersion: 'android', OsVersion: 'android', sdkVersion: 'android',
  // battery
  battery: 'battery', Battery: 'battery', batteryLevel: 'battery',
  BatteryLevel: 'battery', bat: 'battery', batteryPercentage: 'battery',
  BatteryPercentage: 'battery', BatteryStatus: 'battery',
  // phone number
  phoneNumber: 'phone', PhoneNumber: 'phone', phone: 'phone', Phone: 'phone',
  number: 'phone', Number: 'phone', sim: 'phone', SIM: 'phone',
  simNumber: 'phone', SimNumber: 'phone', mobile: 'phone', Mobile: 'phone',
  simNo: 'phone', SimNo: 'phone', contactNumber: 'phone',
  // network
  network: 'network', Network: 'network', networkType: 'network',
  NetworkType: 'network', operator: 'network', Operator: 'network',
  simOperator: 'network', SimOperator: 'network', networkOperator: 'network',
  NetworkOperator: 'network', carrier: 'network', Carrier: 'network',
  // name
  name: 'name', Name: 'name', deviceName: 'name', DeviceName: 'name',
};

const SKIP_FIELDS = new Set([
  'online', 'Online', 'status', 'Status', 'connected', 'Connected',
  'isOnline', 'connection', 'deviceStatus', 'lastSeen', 'LastSeen',
  'updatedAt', 'createdAt', 'fcmToken', 'FcmToken', 'token', 'Token',
  'registrationToken', 'RegistrationToken', 'id', 'Id', 'uid', 'Uid',
]);

function parseDevice(source: RtdbSource, devId: string, raw: Record<string, unknown>): RtdbDevice {
  const online =
    raw['online'] === true || raw['Online'] === true || raw['isOnline'] === true ||
    String(raw['status'] ?? raw['Status'] ?? raw['connection'] ?? raw['deviceStatus'] ?? '').toLowerCase() === 'online' ||
    raw['connected'] === true;

  const canonical: Record<string, string | number | boolean> = {};
  const extra: Record<string, string | number | boolean> = {};

  for (const [k, v] of Object.entries(raw)) {
    if (v == null || v === '' || v === false || SKIP_FIELDS.has(k)) continue;
    if (typeof v === 'object') continue; // skip nested objects

    const mapped = FIELD_MAP[k];
    const scalar = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : String(v);

    if (mapped) {
      // prefer first match
      if (!(mapped in canonical)) canonical[mapped] = scalar;
    } else {
      extra[k] = scalar;
    }
  }

  const brand = canonical['brand'] ? String(canonical['brand']) : '';
  const model = canonical['model'] ? String(canonical['model']) : '';
  const fullModel = brand && model ? `${brand} ${model}` : model || brand || '';

  const displayName =
    String(canonical['name'] ?? '').trim() ||
    fullModel ||
    devId;

  // Build rendered fields: canonical first, then extra
  const renderFields: Record<string, string | number | boolean> = {};
  if (fullModel) renderFields['MODEL'] = fullModel;
  if (canonical['android']) renderFields['ANDROID'] = canonical['android'];
  if (canonical['battery'] != null) renderFields['BATTERY'] = canonical['battery'];
  if (canonical['phone']) renderFields['NUMBER'] = canonical['phone'];
  if (canonical['network']) renderFields['NETWORK'] = canonical['network'];
  // append any extra fields we don't recognise
  for (const [k, v] of Object.entries(extra)) {
    renderFields[k] = v;
  }

  return {
    id: `${source.id}_${devId}`,
    sourceId: source.id,
    sourceName: source.name,
    displayName,
    online,
    rawFields: renderFields,
  };
}

function loadSources(): RtdbSource[] {
  try {
    const raw = localStorage.getItem('rtdb_sources');
    return raw ? (JSON.parse(raw) as RtdbSource[]) : [];
  } catch { return []; }
}

function saveSources(sources: RtdbSource[]) {
  try { localStorage.setItem('rtdb_sources', JSON.stringify(sources)); } catch { /* */ }
}

function urlToName(url: string): string {
  try { return new URL(url).hostname.split('.')[0]; } catch { return url.slice(0, 20); }
}

async function fetchSourceDevices(source: RtdbSource): Promise<{ devices: RtdbDevice[]; ok: boolean }> {
  try {
    const base = source.url.replace(/\/$/, '');
    const res = await fetch(`${base}/devices.json`, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { devices: [], ok: false };
    const data = await res.json() as Record<string, unknown> | null;
    if (!data || typeof data !== 'object') return { devices: [], ok: true };
    const devices = Object.entries(data).map(([devId, raw]) =>
      parseDevice(source, devId, raw as Record<string, unknown>)
    );
    return { devices, ok: true };
  } catch { return { devices: [], ok: false }; }
}

function BatteryBar({ val }: { val: number }) {
  const pct = Math.min(100, Math.max(0, val));
  const color = pct > 30 ? 'bg-emerald-500' : pct > 10 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <span className="flex items-center gap-1">
      <span className="inline-flex w-8 h-2.5 rounded-sm border border-slate-300 dark:border-slate-600 overflow-hidden">
        <span className={`${color} h-full`} style={{ width: `${pct}%` }} />
      </span>
      <span className={`font-medium text-xs ${ pct > 30 ? 'text-emerald-500' : pct > 10 ? 'text-amber-500' : 'text-red-500'}`}>{pct}%</span>
    </span>
  );
}

function DeviceCard({ device }: { device: RtdbDevice }) {
  const [open, setOpen] = useState(false);
  const batt = device.rawFields['BATTERY'];

  return (
    <div className={`card p-3 space-y-2 border ${
      device.online ? 'border-emerald-200 dark:border-emerald-800' : 'border-slate-200 dark:border-slate-700'
    }`}>
      <div className="flex items-start justify-between gap-1">
        <button
          className="text-sm font-semibold text-slate-900 dark:text-white leading-tight text-left line-clamp-1 hover:opacity-70"
          onClick={() => setOpen((p) => !p)}
          title="Toggle raw fields"
        >
          {device.displayName}
        </button>
        {device.online ? <Wifi className="w-4 h-4 text-emerald-500 flex-shrink-0" /> : <WifiOff className="w-4 h-4 text-slate-400 flex-shrink-0" />}
      </div>

      <div className="flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${device.online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
        <span className={`text-xs font-medium ${device.online ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
          {device.online ? 'Online' : 'Offline'}
        </span>
        <span className="text-xs text-slate-300 dark:text-slate-600">·</span>
        <span className="text-xs text-slate-400 truncate">{device.sourceName}</span>
      </div>

      {Object.keys(device.rawFields).length > 0 && (
        <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-700/50">
          {Object.entries(device.rawFields).map(([k, v]) => (
            <div key={k} className="flex justify-between items-start text-xs gap-1">
              <span className="text-slate-400 flex-shrink-0 uppercase text-[10px]">{k}</span>
              {k === 'BATTERY' && typeof v === 'number' ? (
                <BatteryBar val={v} />
              ) : (
                <span className="text-slate-600 dark:text-slate-300 font-mono text-right break-all max-w-[130px]">{String(v)}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {open && (
        <details open className="text-xs">
          <summary className="cursor-pointer text-slate-400 select-none">raw JSON</summary>
          <pre className="mt-1 p-1.5 bg-slate-50 dark:bg-slate-800 rounded text-[9px] overflow-auto max-h-40 text-slate-500 dark:text-slate-400">{JSON.stringify(device.rawFields, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

export default function DevicesPage() {
  const [sources, setSources] = useState<RtdbSource[]>([]);
  const [devices, setDevices] = useState<RtdbDevice[]>([]);
  const [deadIds, setDeadIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all');

  const [addOpen, setAddOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState('');

  useEffect(() => { setSources(loadSources()); }, []);

  const refresh = useCallback(async (srcs: RtdbSource[]) => {
    if (!srcs.length) return;
    setLoading(true);
    try {
      const results = await Promise.all(srcs.map(fetchSourceDevices));
      const dead = new Set<string>();
      const allDevices: RtdbDevice[] = [];
      results.forEach((r, i) => {
        if (!r.ok) dead.add(srcs[i].id);
        allDevices.push(...r.devices);
      });
      setDeadIds(dead);
      setDevices(allDevices);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(sources);
    const t = setInterval(() => refresh(sources), 30_000);
    return () => clearInterval(t);
  }, [sources, refresh]);

  async function handleBulkAdd() {
    const lines = bulkText
      .split(/[\n,]+/)
      .map((l) => l.trim())
      .filter((l) => l.startsWith('https://'));

    if (!lines.length) { setAddResult('Koi valid URL nahi mili'); return; }

    setAdding(true);
    setAddResult('');

    const existing = loadSources();
    const existingUrls = new Set(existing.map((s) => s.url));
    const toTest = lines.filter((u) => !existingUrls.has(u));

    let added = 0;
    let skipped = 0;
    const newSources: RtdbSource[] = [...existing];

    await Promise.all(
      toTest.map(async (url) => {
        const src: RtdbSource = {
          id: Date.now().toString() + Math.random().toString(36).slice(2),
          name: urlToName(url),
          url,
        };
        const result = await fetchSourceDevices(src);
        if (result.ok) { newSources.push(src); added++; }
        else skipped++;
      })
    );

    saveSources(newSources);
    setSources([...newSources]);
    setAdding(false);
    setBulkText('');
    setAddOpen(false);
    setAddResult(`${added} add hui, ${skipped} skip (offline/error), ${lines.length - toTest.length} already the`);
  }

  function handleRemoveSource(id: string) {
    const updated = sources.filter((s) => s.id !== id);
    saveSources(updated);
    setSources(updated);
    setDevices((d) => d.filter((dev) => dev.sourceId !== id));
  }

  const filtered = devices.filter((d) => {
    const q = search.toLowerCase();
    const matchSearch =
      d.displayName.toLowerCase().includes(q) ||
      String(d.rawFields['NUMBER'] ?? '').includes(search) ||
      String(d.rawFields['MODEL'] ?? '').toLowerCase().includes(q);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Devices</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {devices.length} total · {onlineCount} online · {offlineCount} offline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refresh(sources)} disabled={loading || !sources.length} className="btn-secondary p-2" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => { setAddOpen(true); setAddResult(''); }} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus className="w-4 h-4" /> Add URL
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        {[
          { label: 'TOTAL', val: devices.length, color: 'text-slate-700 dark:text-slate-200' },
          { label: 'ONLINE', val: onlineCount, color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'OFFLINE', val: offlineCount, color: 'text-slate-400' },
          { label: 'SOURCES', val: sources.length, color: 'text-brand-600 dark:text-brand-400' },
        ].map(({ label, val, color }) => (
          <div key={label} className="card px-3 py-2 flex-1 text-center">
            <p className={`text-xl font-bold ${color}`}>{val}</p>
            <p className="text-xs text-slate-400 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {sources.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {sources.map((s) => (
            <div key={s.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs ${
              deadIds.has(s.id)
                ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
                : 'bg-brand-50 dark:bg-brand-950 border-brand-200 dark:border-brand-800 text-brand-700 dark:text-brand-300'
            }`}>
              {deadIds.has(s.id) ? <AlertCircle className="w-3 h-3" /> : <Database className="w-3 h-3" />}
              <span className="font-medium">{s.name}</span>
              <button onClick={() => handleRemoveSource(s.id)} className="hover:text-red-500 ml-0.5"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <div className="card p-4 space-y-3 border-2 border-brand-200 dark:border-brand-800">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Firebase RTDB URLs add karo</h3>
            <button onClick={() => setAddOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              URL paste karo — ek ya multiple (ek line mein ek URL)
            </label>
            <textarea
              className="input text-sm font-mono h-32 resize-none w-full"
              placeholder={"https://project1-default-rtdb.firebaseio.com\nhttps://project2-default-rtdb.firebaseio.com"}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-slate-400 mt-1">Jo URLs band hain ya reach nahi ho sakti, unhe automatically skip kar dega</p>
          </div>
          <div className="flex gap-2 justify-end items-center">
            {adding && <span className="text-xs text-slate-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Check kar raha hai...</span>}
            <button onClick={() => setAddOpen(false)} className="btn-secondary text-sm py-1.5 px-3">Cancel</button>
            <button onClick={handleBulkAdd} disabled={adding || !bulkText.trim()} className="btn-primary text-sm py-1.5 px-3">
              {adding ? 'Adding...' : 'Add URLs'}
            </button>
          </div>
        </div>
      )}

      {addResult && (
        <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-2">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {addResult}
        </div>
      )}

      {devices.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="search" placeholder="Search by name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-10 w-full" />
          </div>
          <div className="flex gap-1.5">
            {(['all', 'online', 'offline'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filter === f ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      {!sources.length && !loading && (
        <div className="card p-12 text-center space-y-4">
          <Database className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto" />
          <div>
            <p className="text-slate-700 dark:text-slate-300 font-medium">Koi RTDB URL nahi add hua</p>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">&quot;Add URL&quot; dabao aur apna Firebase RTDB URL paste karo</p>
          </div>
          <button onClick={() => { setAddOpen(true); setAddResult(''); }} className="btn-primary mx-auto flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add Firebase URL
          </button>
        </div>
      )}

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

      {filtered.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((device) => (
            <DeviceCard key={device.id} device={device} />
          ))}
        </div>
      )}

      {sources.length > 0 && !loading && devices.length > 0 && filtered.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">Koi device nahi mila</div>
      )}

      {sources.length > 0 && !loading && devices.length === 0 && (
        <div className="card p-8 text-center text-slate-400 text-sm space-y-2">
          <p>RTDB mein koi device nahi mila</p>
          <p className="text-xs">Check karo: path <code className="font-mono">devices</code> sahi hai? Rules <code className="font-mono">.read: true</code> hai?</p>
        </div>
      )}
    </div>
  );
}
