'use client';

import { useEffect, useState } from 'react';
import { Upload, Search, Download, UserX, RefreshCw } from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { apiFetch } from '@/hooks/useApi';
import { formatRelativeTime } from '@/lib/utils';
import type { ContactBatch } from '@/types';

export default function ContactsPage() {
  const { idToken } = useAuth();
  const [batches, setBatches] = useState<ContactBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [optedOutNumbers, setOptedOutNumbers] = useState<string[]>([]);
  const [addOptOut, setAddOptOut] = useState('');
  const [savingOptOut, setSavingOptOut] = useState(false);

  async function load() {
    if (!idToken) return;
    setLoading(true);
    try {
      const res = await fetch('/api/contacts/batches', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = await res.json();
      if (json.success) setBatches(json.data?.items ?? []);

      const optRes = await fetch('/api/contacts/opted-out', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const optJson = await optRes.json();
      if (optJson.success) setOptedOutNumbers(optJson.data ?? []);
    } catch {
      // pass
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [idToken]);

  async function handleAddOptOut() {
    if (!idToken || !addOptOut.trim()) return;
    setSavingOptOut(true);
    try {
      await fetch('/api/contacts/opted-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ phone: addOptOut.trim() }),
      });
      setAddOptOut('');
      await load();
    } finally {
      setSavingOptOut(false);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Contacts</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Uploaded batches and opt-out list
          </p>
        </div>
        <button onClick={load} className="btn-secondary" disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Contact Batches */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Uploaded Batches
          </h2>
        </div>
        {loading ? (
          <div className="p-6 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 bg-slate-100 dark:bg-slate-700 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : batches.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Upload className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400">
              No contact batches yet. Upload a CSV when creating a campaign.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {batches.map((batch) => (
              <div key={batch.id} className="px-6 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {batch.fileName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {batch.validCount} valid · {batch.invalidCount} invalid ·{' '}
                    {batch.duplicateCount} duplicates · {formatRelativeTime(batch.uploadedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-emerald-600 font-medium">{batch.validCount} valid</span>
                  <button className="btn-secondary text-xs py-1">
                    <Download className="w-3 h-3" />
                    Export
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Opt-out list */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <UserX className="w-5 h-5 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Opt-Out / Suppression List ({optedOutNumbers.length})
          </h2>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Numbers on this list will be automatically excluded from all campaigns.
        </p>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="+91XXXXXXXXXX"
            value={addOptOut}
            onChange={(e) => setAddOptOut(e.target.value)}
            className="input flex-1 max-w-xs"
            onKeyDown={(e) => e.key === 'Enter' && handleAddOptOut()}
          />
          <button
            onClick={handleAddOptOut}
            disabled={savingOptOut || !addOptOut.trim()}
            className="btn-primary"
          >
            Add
          </button>
        </div>

        {optedOutNumbers.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
            {optedOutNumbers.map((phone) => (
              <div
                key={phone}
                className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg"
              >
                <span className="text-xs font-mono text-slate-700 dark:text-slate-300">
                  {phone}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
