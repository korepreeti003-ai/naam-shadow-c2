'use client';

import { useEffect, useState } from 'react';
import {
  Smartphone,
  Send,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Activity,
  RefreshCw,
} from 'lucide-react';
import { StatCard } from '@/components/stat-card';
import { CampaignStatusBadge } from '@/components/campaign-status-badge';
import { DeviceStatusBadge } from '@/components/device-status-badge';
import { useAuth } from '@/components/auth-provider';
import { apiFetch } from '@/hooks/useApi';
import { formatRelativeTime, formatNumber, formatPercent } from '@/lib/utils';
import type { DashboardStats, Device, Campaign } from '@/types';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function DashboardPage() {
  const { idToken } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentDevices, setRecentDevices] = useState<Device[]>([]);
  const [recentCampaigns, setRecentCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  async function load() {
    if (!idToken) return;
    setLoading(true);
    try {
      const [statsData, devicesData, campaignsData] = await Promise.all([
        apiFetch<DashboardStats>('/api/dashboard', idToken),
        apiFetch<{ items: Device[] }>('/api/devices?pageSize=5', idToken),
        apiFetch<{ items: Campaign[] }>('/api/campaigns?pageSize=5', idToken),
      ]);
      setStats(statsData);
      setRecentDevices(devicesData.items);
      setRecentCampaigns(campaignsData.items);
      setLastRefreshed(new Date());
    } catch {
      // pass
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [idToken]);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Last refreshed: {formatRelativeTime(lastRefreshed.toISOString())}
          </p>
        </div>
        <button onClick={load} className="btn-secondary" disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Online Devices"
            value={stats.devices.online}
            subLabel={`${stats.devices.total} total`}
            icon={Smartphone}
            iconColor="text-emerald-500"
          />
          <StatCard
            label="Messages Sent"
            value={formatNumber(stats.messages.total)}
            subLabel={`${stats.messages.delivered} delivered`}
            icon={Send}
            iconColor="text-brand-500"
          />
          <StatCard
            label="Delivery Rate"
            value={`${stats.messages.deliveryRate}%`}
            subLabel="Confirmed receipts"
            icon={TrendingUp}
            iconColor="text-violet-500"
          />
          <StatCard
            label="Active Campaigns"
            value={stats.campaigns.running}
            subLabel={`${stats.campaigns.total} total`}
            icon={Activity}
            iconColor="text-amber-500"
          />
        </div>
      )}

      {/* Charts + Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Message delivery breakdown */}
        {stats && (
          <div className="card p-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
              Message Summary
            </h2>
            <div className="space-y-3">
              {[
                { label: 'Delivered', value: stats.messages.delivered, color: 'bg-emerald-500', icon: CheckCircle2, iconClass: 'text-emerald-500' },
                { label: 'Failed', value: stats.messages.failed, color: 'bg-red-500', icon: XCircle, iconClass: 'text-red-500' },
                { label: 'Pending', value: stats.messages.total - stats.messages.delivered - stats.messages.failed, color: 'bg-amber-400', icon: Send, iconClass: 'text-amber-500' },
              ].map(({ label, value, color, icon: Icon, iconClass }) => (
                <div key={label} className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${iconClass} flex-shrink-0`} />
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-600 dark:text-slate-400">{label}</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {formatNumber(value)} ({formatPercent(value, stats.messages.total || 1)})
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${color} rounded-full transition-all`}
                        style={{ width: formatPercent(value, stats.messages.total || 1) }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent activity */}
        {stats && (
          <div className="card p-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-4">
              Recent Activity
            </h2>
            {stats.recentActivity.length === 0 ? (
              <p className="text-sm text-slate-400">No recent activity</p>
            ) : (
              <div className="space-y-3">
                {stats.recentActivity.map((item) => (
                  <div key={item.id} className="flex items-start gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-brand-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {item.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {item.description} · {formatRelativeTime(item.timestamp)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Devices + Campaigns side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent devices */}
        <div className="card">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Devices</h2>
            <a href="/devices" className="text-xs text-brand-600 hover:underline">
              View all
            </a>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentDevices.length === 0 ? (
              <p className="px-6 py-4 text-sm text-slate-400">No devices registered</p>
            ) : (
              recentDevices.map((device) => (
                <div key={device.id} className="px-6 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {device.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {device.phoneNumber ?? 'No phone'} · {formatRelativeTime(device.lastSeen)}
                    </p>
                  </div>
                  <DeviceStatusBadge status={device.status} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent campaigns */}
        <div className="card">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Campaigns</h2>
            <a href="/campaigns" className="text-xs text-brand-600 hover:underline">
              View all
            </a>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentCampaigns.length === 0 ? (
              <p className="px-6 py-4 text-sm text-slate-400">No campaigns yet</p>
            ) : (
              recentCampaigns.map((campaign) => (
                <div key={campaign.id} className="px-6 py-3 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {campaign.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {campaign.stats.delivered}/{campaign.stats.total} delivered
                    </p>
                  </div>
                  <CampaignStatusBadge status={campaign.status} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
