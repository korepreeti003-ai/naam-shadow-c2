'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Play, Pause, X, Download, RefreshCw, MessageSquare } from 'lucide-react';
import { CampaignStatusBadge } from '@/components/campaign-status-badge';
import { useAuth } from '@/components/auth-provider';
import { apiFetch } from '@/hooks/useApi';
import { formatRelativeTime, formatNumber, formatPercent } from '@/lib/utils';
import type { Campaign, Contact, PaginatedResponse } from '@/types';

export default function CampaignDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { idToken } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const id = params.id as string;

  async function load() {
    if (!idToken) return;
    setLoading(true);
    try {
      const [c, cList] = await Promise.all([
        apiFetch<Campaign>(`/api/campaigns/${id}`, idToken),
        apiFetch<PaginatedResponse<Contact>>(`/api/contacts?campaignId=${id}&pageSize=100`, idToken),
      ]);
      setCampaign(c);
      setContacts(cList.items);
    } catch {
      // pass
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [idToken, id]);

  async function handleAction(action: string) {
    if (!idToken) return;
    setActionLoading(true);
    try {
      await fetch(`/api/campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ action }),
      });
      await load();
    } finally {
      setActionLoading(false);
    }
  }

  if (loading || !campaign) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const { stats } = campaign;
  const progress = stats.total > 0
    ? Math.round(((stats.sent + stats.delivered + stats.failed) / stats.total) * 100)
    : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{campaign.name}</h1>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Created {formatRelativeTime(campaign.createdAt)}
            {campaign.startedAt && ` · Started ${formatRelativeTime(campaign.startedAt)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="btn-secondary">
            <RefreshCw className="w-4 h-4" />
          </button>
          {campaign.status === 'draft' && (
            <button onClick={() => handleAction('start')} className="btn-primary" disabled={actionLoading}>
              <Play className="w-4 h-4" />
              Start
            </button>
          )}
          {campaign.status === 'running' && (
            <button onClick={() => handleAction('pause')} className="btn-secondary" disabled={actionLoading}>
              <Pause className="w-4 h-4" />
              Pause
            </button>
          )}
          {campaign.status === 'paused' && (
            <button onClick={() => handleAction('resume')} className="btn-primary" disabled={actionLoading}>
              <Play className="w-4 h-4" />
              Resume
            </button>
          )}
          {['draft', 'queued', 'running', 'paused'].includes(campaign.status) && (
            <button onClick={() => handleAction('cancel')} className="btn-danger" disabled={actionLoading}>
              <X className="w-4 h-4" />
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats.total, color: 'text-slate-900 dark:text-white' },
          { label: 'Delivered', value: stats.delivered, color: 'text-emerald-600' },
          { label: 'Failed', value: stats.failed, color: 'text-red-500' },
          { label: 'Pending', value: stats.queued + stats.sending, color: 'text-amber-500' },
        ].map(({ label, value, color }) => (
          <div key={label} className="card p-4 text-center">
            <p className={`text-2xl font-bold ${color}`}>{formatNumber(value)}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div className="card p-5">
        <div className="flex justify-between text-sm mb-2">
          <span className="font-medium text-slate-900 dark:text-white">Campaign Progress</span>
          <span className="text-slate-500">{progress}%</span>
        </div>
        <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-slate-400 mt-1">
          <span>{formatNumber(stats.sent + stats.delivered + stats.failed)} processed</span>
          <span>{formatNumber(stats.total)} total</span>
        </div>
      </div>

      {/* Message */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare className="w-4 h-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Message</h2>
        </div>
        <p className="text-sm text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800 rounded-lg px-4 py-3">
          {campaign.message}
        </p>
      </div>

      {/* Contact list */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Contacts ({contacts.length})
          </h2>
          <button className="btn-secondary text-xs">
            <Download className="w-3 h-3" />
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {['Phone', 'Name', 'Status', 'Sent', 'Delivered'].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {contacts.slice(0, 100).map((contact) => (
                <tr key={contact.id} className="text-sm">
                  <td className="px-4 py-2.5 font-mono text-slate-700 dark:text-slate-300">
                    {contact.phone}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                    {contact.name ?? '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`badge ${
                        contact.status === 'delivered'
                          ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
                          : contact.status === 'failed'
                          ? 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400'
                          : contact.status === 'sent'
                          ? 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {contact.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                    {contact.sentAt ? formatRelativeTime(contact.sentAt) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                    {contact.deliveredAt ? formatRelativeTime(contact.deliveredAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
