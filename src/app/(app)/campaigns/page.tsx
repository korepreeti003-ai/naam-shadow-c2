'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Search, Play, Pause, X, Eye, RefreshCw } from 'lucide-react';
import { CampaignStatusBadge } from '@/components/campaign-status-badge';
import { useAuth } from '@/components/auth-provider';
import { apiFetch } from '@/hooks/useApi';
import { formatRelativeTime, formatNumber, formatPercent } from '@/lib/utils';
import type { Campaign, PaginatedResponse, CampaignStatus } from '@/types';

const ACTION_CONFIG: Partial<Record<CampaignStatus, { action: string; icon: typeof Play; label: string; danger?: boolean }>> = {
  running: { action: 'pause', icon: Pause, label: 'Pause' },
  paused: { action: 'resume', icon: Play, label: 'Resume' },
  draft: { action: 'start', icon: Play, label: 'Start' },
  queued: { action: 'cancel', icon: X, label: 'Cancel', danger: true },
};

export default function CampaignsPage() {
  const { idToken } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  async function load() {
    if (!idToken) return;
    setLoading(true);
    try {
      const data = await apiFetch<PaginatedResponse<Campaign>>('/api/campaigns?pageSize=50', idToken);
      setCampaigns(data.items);
      setTotal(data.total);
    } catch {
      // pass
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [idToken]);

  async function handleAction(campaignId: string, action: string) {
    if (!idToken) return;
    setActionLoading(campaignId);
    try {
      await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ action }),
      });
      await load();
    } finally {
      setActionLoading(null);
    }
  }

  const filtered = campaigns.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Campaigns</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{total} total</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} className="btn-secondary" disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <Link href="/campaigns/new" className="btn-primary">
            <Plus className="w-4 h-4" />
            New Campaign
          </Link>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="search"
          placeholder="Search campaigns…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-10 max-w-sm"
        />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {['Campaign', 'Status', 'Progress', 'Sent', 'Delivered', 'Failed', 'Created', 'Actions'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">
                    No campaigns yet.{' '}
                    <Link href="/campaigns/new" className="text-brand-600 hover:underline">
                      Create one
                    </Link>
                  </td>
                </tr>
              ) : (
                filtered.map((campaign) => {
                  const { stats } = campaign;
                  const progress = stats.total > 0
                    ? Math.round(((stats.sent + stats.delivered + stats.failed) / stats.total) * 100)
                    : 0;
                  const actionCfg = ACTION_CONFIG[campaign.status];

                  return (
                    <tr
                      key={campaign.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {campaign.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs">
                          {campaign.message.slice(0, 60)}{campaign.message.length > 60 ? '…' : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <CampaignStatusBadge status={campaign.status} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand-500 rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-500 w-8">{progress}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                        {formatNumber(stats.sent + stats.delivered)}
                      </td>
                      <td className="px-4 py-3 text-sm text-emerald-600 font-medium">
                        {formatNumber(stats.delivered)}
                      </td>
                      <td className="px-4 py-3 text-sm text-red-500 font-medium">
                        {formatNumber(stats.failed)}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                        {formatRelativeTime(campaign.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/campaigns/${campaign.id}`}
                            className="p-1.5 rounded-md text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950 transition-colors"
                            title="View"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>
                          {actionCfg && (
                            <button
                              onClick={() => handleAction(campaign.id, actionCfg.action)}
                              disabled={actionLoading === campaign.id}
                              className={`p-1.5 rounded-md transition-colors ${
                                actionCfg.danger
                                  ? 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950'
                                  : 'text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950'
                              }`}
                              title={actionCfg.label}
                            >
                              <actionCfg.icon className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
