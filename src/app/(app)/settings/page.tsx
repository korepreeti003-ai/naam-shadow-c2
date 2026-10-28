'use client';

import { useState, useEffect, useCallback } from 'react';
import { Shield, Bell, Database, Key, Info, Lock, Unlock, Plus, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { useTheme } from '@/components/theme-provider';
import { apiFetch } from '@/hooks/useApi';

interface FirebaseProject {
  id: string;
  name: string;
  projectId: string;
  rtdbUrl?: string;
  notes?: string;
  createdAt: string;
}

export default function SettingsPage() {
  const { user, appUser, idToken } = useAuth();
  const { theme, setTheme } = useTheme();
  const [webhookUrl] = useState(
    typeof window !== 'undefined' ? `${window.location.origin}/api/webhook/device-status` : ''
  );
  const [copied, setCopied] = useState(false);

  // ─── Firebase Projects locked section ───────────────────────────────────
  const [unlocked, setUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState('');
  const [pwError, setPwError] = useState('');
  const [unlocking, setUnlocking] = useState(false);

  const [projects, setProjects] = useState<FirebaseProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', projectId: '', serviceAccountJson: '', rtdbUrl: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  function copyWebhook() {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const loadProjects = useCallback(async (pw: string) => {
    if (!idToken) return;
    setLoadingProjects(true);
    try {
      const data = await apiFetch<FirebaseProject[]>('/api/settings/firebase-projects', idToken, {
        headers: { 'x-settings-token': pw },
      });
      setProjects(data ?? []);
    } finally {
      setLoadingProjects(false);
    }
  }, [idToken]);

  async function handleUnlock() {
    setPwError('');
    setUnlocking(true);
    try {
      const res = await fetch('/api/settings/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwInput }),
      });
      if (!res.ok) {
        setPwError('Wrong password');
        return;
      }
      setUnlocked(true);
      await loadProjects(pwInput);
    } finally {
      setUnlocking(false);
    }
  }

  async function handleAdd() {
    if (!form.name || !form.projectId) { setSaveError('Name and Project ID are required'); return; }
    setSaving(true); setSaveError('');
    try {
      await apiFetch('/api/settings/firebase-projects', idToken!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-settings-token': pwInput },
        body: JSON.stringify(form),
      });
      setForm({ name: '', projectId: '', serviceAccountJson: '', rtdbUrl: '', notes: '' });
      setAddOpen(false);
      await loadProjects(pwInput);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this project?')) return;
    await apiFetch('/api/settings/firebase-projects', idToken!, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-settings-token': pwInput },
      body: JSON.stringify({ id }),
    });
    await loadProjects(pwInput);
  }

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Account preferences and system configuration
        </p>
      </div>

      {/* Account */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-brand-500" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Account</h2>
        </div>
        <div className="space-y-3">
          {[
            { label: 'Email', value: user?.email ?? '—' },
            { label: 'Role', value: appUser?.role ?? '—' },
            { label: 'UID', value: user?.uid ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
              <span className="text-sm font-medium text-slate-900 dark:text-white font-mono">
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Appearance */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="w-5 h-5 text-brand-500" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Appearance</h2>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
            Theme
          </label>
          <div className="flex gap-2">
            {(['light', 'dark', 'system'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                  theme === t
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Device Webhook */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-brand-500" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Device Callback URL
          </h2>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Configure your Android SMS app to POST delivery receipts and heartbeats to this endpoint.
        </p>
        <div className="flex gap-2">
          <input readOnly value={webhookUrl} className="input flex-1 font-mono text-xs" />
          <button onClick={copyWebhook} className="btn-secondary whitespace-nowrap">
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-blue-700 dark:text-blue-400 space-y-1">
            <p>Expected POST body fields:</p>
            <code className="block font-mono">
              {`{ "deviceId": "...", "type": "DELIVERY_RECEIPT" | "HEARTBEAT", "messageId": "...", "delivered": true/false }`}
            </code>
          </div>
        </div>
      </div>

      {/* Firebase Config */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-brand-500" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Firebase Configuration
          </h2>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Firebase credentials are loaded from environment variables on the server.
          See <code className="text-xs bg-slate-100 dark:bg-slate-700 px-1 rounded">.env.example</code> for
          the required variables.
        </p>
        <div className="space-y-2">
          {[
            'FIREBASE_SERVICE_ACCOUNT_JSON',
            'NEXT_PUBLIC_FIREBASE_API_KEY',
            'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
            'REDIS_HOST',
          ].map((key) => (
            <div key={key} className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full bg-slate-300" />
              <code className="font-mono text-slate-600 dark:text-slate-400">{key}</code>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Firebase Projects (password-locked) ──────────────────────────── */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {unlocked
              ? <Unlock className="w-5 h-5 text-emerald-500" />
              : <Lock className="w-5 h-5 text-brand-500" />}
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Firebase Projects
            </h2>
          </div>
          {unlocked && (
            <button
              onClick={() => { setAddOpen(true); setSaveError(''); }}
              className="btn-primary flex items-center gap-1 text-sm py-1.5 px-3"
            >
              <Plus className="w-4 h-4" /> Add Project
            </button>
          )}
        </div>

        {!unlocked ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Enter your settings password to manage Firebase projects.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={pwInput}
                onChange={(e) => setPwInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
                placeholder="Password"
                className="input flex-1"
              />
              <button
                onClick={handleUnlock}
                disabled={unlocking || !pwInput}
                className="btn-primary whitespace-nowrap"
              >
                {unlocking ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Unlock'}
              </button>
            </div>
            {pwError && <p className="text-sm text-red-500">{pwError}</p>}
          </div>
        ) : (
          <>
            {/* Add form */}
            {addOpen && (
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-3 bg-slate-50 dark:bg-slate-800/50">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">New Firebase Project</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Display Name *
                    </label>
                    <input
                      className="input text-sm"
                      placeholder="My Project"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Firebase Project ID *
                    </label>
                    <input
                      className="input text-sm font-mono"
                      placeholder="my-project-12345"
                      value={form.projectId}
                      onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Service Account JSON <span className="text-slate-400">(paste full JSON for FCM dispatch)</span>
                  </label>
                  <textarea
                    className="input text-xs font-mono h-20 resize-none"
                    placeholder='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'
                    value={form.serviceAccountJson}
                    onChange={(e) => setForm((f) => ({ ...f, serviceAccountJson: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Realtime Database URL (optional)
                  </label>
                  <input
                    className="input text-sm font-mono"
                    placeholder="https://my-project-default-rtdb.firebaseio.com"
                    value={form.rtdbUrl}
                    onChange={(e) => setForm((f) => ({ ...f, rtdbUrl: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Notes (optional)
                  </label>
                  <input
                    className="input text-sm"
                    placeholder="e.g. Mumbai region, 50 devices"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>
                {saveError && <p className="text-xs text-red-500">{saveError}</p>}
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setAddOpen(false)} className="btn-secondary text-sm py-1.5 px-3">
                    Cancel
                  </button>
                  <button onClick={handleAdd} disabled={saving} className="btn-primary text-sm py-1.5 px-3">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {/* Projects list */}
            {loadingProjects ? (
              <div className="flex justify-center py-6">
                <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
              </div>
            ) : projects.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">
                No projects added yet. Click "Add Project" to start.
              </p>
            ) : (
              <div className="space-y-2">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-start justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{p.name}</p>
                        {(p as FirebaseProject & { serviceAccountJson?: string }).serviceAccountJson && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 flex-shrink-0">FCM ready</span>
                        )}
                      </div>
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">{p.projectId}</p>
                      {p.rtdbUrl && (
                        <p className="text-xs font-mono text-slate-400 dark:text-slate-500 truncate">{p.rtdbUrl}</p>
                      )}
                      {p.notes && (
                        <p className="text-xs text-slate-400 dark:text-slate-500">{p.notes}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="ml-3 flex-shrink-0 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
