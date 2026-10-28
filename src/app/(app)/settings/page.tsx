'use client';

import { useState } from 'react';
import { Shield, Bell, Database, Key, Info } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { useTheme } from '@/components/theme-provider';

export default function SettingsPage() {
  const { user, appUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const [webhookUrl] = useState(
    typeof window !== 'undefined' ? `${window.location.origin}/api/webhook/device-status` : ''
  );
  const [copied, setCopied] = useState(false);

  function copyWebhook() {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <input
            readOnly
            value={webhookUrl}
            className="input flex-1 font-mono text-xs"
          />
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
              <div className={`w-2 h-2 rounded-full ${process.env[key] ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <code className="font-mono text-slate-600 dark:text-slate-400">{key}</code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
