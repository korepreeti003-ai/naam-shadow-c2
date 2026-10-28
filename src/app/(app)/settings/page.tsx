'use client';

import { useEffect, useRef, useState } from 'react';
import { Save, Plus, Trash2, CheckCircle2, Database, Mail, CreditCard, KeyRound, FileJson, Upload } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';

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

function Toast({ msg }: { msg: string }) {
  return msg ? (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium animate-fade-in">
      <CheckCircle2 className="w-4 h-4" /> {msg}
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

export default function SettingsPage() {
  const { user } = useAuth();
  const [rtdbUrl, setRtdbUrl] = useState('');
  const [smtp, setSmtp] = useState<SmtpConfig>(SMTP_DEFAULT);
  const [slots, setSlots] = useState<SimSlot[]>(SLOTS_DEFAULT);
  const [toast, setToast] = useState('');
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
    // load service account info display
    const saRaw = localStorage.getItem('panel_service_account');
    if (saRaw) {
      try {
        const sa = JSON.parse(saRaw) as Record<string, string>;
        setSaInfo({ client_email: sa.client_email ?? '', project_id: sa.project_id ?? '', loaded: true });
      } catch { /**/ }
    }
    // load google services info display
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

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500); }

  // ─── Google Services JSON ─────────────────────────────────
  function extractDatabaseURL(obj: Record<string, unknown>): string {
    // google-services.json format
    if (typeof obj.databaseURL === 'string') return obj.databaseURL;
    const proj = obj.project_info as Record<string, unknown> | undefined;
    if (proj && typeof proj.firebase_url === 'string') return proj.firebase_url;
    const clients = obj.client as Array<Record<string, unknown>> | undefined;
    if (clients?.[0]) {
      const svcs = clients[0].services as Record<string, unknown> | undefined;
      const rtdb = svcs?.appinvite_service as Record<string, unknown> | undefined;
      if (rtdb && typeof rtdb.other_platform_oauth_client === 'string') { /**/ }
    }
    // fallback: build from project_id
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
    } catch { showToast('Invalid JSON — check google-services.json'); }
  }

  function parseServiceAccount(raw: string) {
    try {
      const sa = JSON.parse(raw) as Record<string, string>;
      if (sa.type !== 'service_account') { showToast('Not a service account JSON'); return; }
      if (!sa.private_key || !sa.client_email) { showToast('Missing private_key or client_email'); return; }
      localStorage.setItem('panel_service_account', raw);
      setSaInfo({ client_email: sa.client_email, project_id: sa.project_id ?? '', loaded: true });
      showToast('Service account saved');
    } catch { showToast('Invalid JSON — check admin SDK file'); }
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

  // ─── RTDB ─────────────────────────────────────────────────
  function saveRtdb() {
    const cleaned = rtdbUrl.trim().replace(/\/$/, '');
    localStorage.setItem('panel_rtdb_url', cleaned);
    setRtdbUrl(cleaned);
    showToast('Firebase URL saved');
  }

  // ─── SMTP ─────────────────────────────────────────────────
  function saveSmtp() { save('panel_smtp', smtp); showToast('SMTP settings saved'); }

  // ─── Slots ────────────────────────────────────────────────
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
            <textarea
              rows={4}
              value={gsText}
              onChange={e => setGsText(e.target.value)}
              placeholder='Paste google-services.json content here...'
              className="input w-full text-xs font-mono resize-none"
            />
            <div className="flex gap-2">
              <button onClick={() => gsText.trim() && parseGoogleServices(gsText)} disabled={!gsText.trim()} className="btn-primary gap-2 text-sm">
                <Save className="w-4 h-4" /> Save JSON
              </button>
              <button onClick={() => gsFileRef.current?.click()} className="btn-secondary gap-2 text-sm">
                <Upload className="w-4 h-4" /> Upload File
              </button>
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
            <button onClick={clearSa} className="btn-secondary gap-2 text-sm text-red-500 hover:text-red-600">
              <Trash2 className="w-4 h-4" /> Remove Key
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">Firebase Console → Project Settings → Service Accounts → Generate New Private Key → paste or upload</p>
            <textarea
              rows={4}
              value={saText}
              onChange={e => setSaText(e.target.value)}
              placeholder='Paste firebase-adminsdk-xxxxx.json content here...'
              className="input w-full text-xs font-mono resize-none"
            />
            <div className="flex gap-2">
              <button onClick={() => saText.trim() && parseServiceAccount(saText)} disabled={!saText.trim()} className="btn-primary gap-2 text-sm">
                <Save className="w-4 h-4" /> Save Key
              </button>
              <button onClick={() => saFileRef.current?.click()} className="btn-secondary gap-2 text-sm">
                <Upload className="w-4 h-4" /> Upload File
              </button>
            </div>
            <input ref={saFileRef} type="file" accept=".json" className="hidden" onChange={handleSaFile} />
          </div>
        )}
      </Section>

      {/* Firebase RTDB URL */}
      <Section icon={<Database className="w-4 h-4" />} iconBg="bg-orange-50 dark:bg-orange-950" iconColor="text-orange-500" title="Firebase RTDB URL" sub="Realtime Database URL (auto-filled from google-services.json)">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Database URL</label>
          <input
            type="url"
            value={rtdbUrl}
            onChange={e => setRtdbUrl(e.target.value)}
            placeholder="https://your-project-default-rtdb.firebaseio.com"
            className="input w-full font-mono text-sm"
          />
          <p className="text-[11px] text-slate-400">Firebase Console → Realtime Database → copy URL</p>
        </div>
        <button onClick={saveRtdb} className="btn-primary gap-2 text-sm">
          <Save className="w-4 h-4" /> Save URL
        </button>
      </Section>

      {/* SMTP */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
              <Mail className="w-4 h-4 text-blue-500" />
            </div>
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
            <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-violet-500" />
            </div>
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

      <Toast msg={toast} />
    </div>
  );
}
