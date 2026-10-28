'use client';

import { useEffect, useState } from 'react';
import { Plus, Search, RefreshCw, Wifi, WifiOff, Zap, Trash2, Radio } from 'lucide-react';
import { DeviceStatusBadge } from '@/components/device-status-badge';
import { useAuth } from '@/components/auth-provider';
import { apiFetch } from '@/hooks/useApi';
import { formatRelativeTime } from '@/lib/utils';
import type { Device, PaginatedResponse } from '@/types';

export default function DevicesPage() {
  const { idToken } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pingingId, setPingingId] = useState<string | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  async function load() {
    if (!idToken) return;
    setLoading(true);
    try {
      const data = await apiFetch<PaginatedResponse<Device>>('/api/devices?pageSize=50', idToken);
      setDevices(data.items);
      setTotal(data.total);
    } catch {
      // pass
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [idToken]);

  async function handlePing(deviceId: string) {
    if (!idToken) return;
    setPingingId(deviceId);
    try {
      await fetch(`/api/devices/${deviceId}/ping`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      await load();
    } finally {
      setPingingId(null);
    }
  }

  async function handleDelete(deviceId: string) {
    if (!idToken || !confirm('Remove this device?')) return;
    await fetch(`/api/devices/${deviceId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${idToken}` },
    });
    await load();
  }

  const filtered = devices.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.phoneNumber ?? '').includes(search)
  );

  const onlineCount = devices.filter((d) => ['online', 'idle', 'busy'].includes(d.status)).length;
  const offlineCount = devices.filter((d) => d.status === 'offline').length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Devices</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {onlineCount} online · {offlineCount} offline · {total} total
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={load} className="btn-secondary" disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowRegisterModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            Register Device
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="search"
          placeholder="Search by name or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-10 max-w-sm"
        />
      </div>

      {/* Device table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                {['Device', 'Phone', 'Status', 'Last Seen', 'Sent / Delivered', 'Battery', 'Actions'].map(
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
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 dark:bg-slate-700 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-sm text-slate-400"
                  >
                    No devices found
                  </td>
                </tr>
              ) : (
                filtered.map((device) => (
                  <tr
                    key={device.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-950 flex items-center justify-center">
                          <Radio className="w-4 h-4 text-brand-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-white">
                            {device.name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {device.model ?? 'Unknown model'} · {device.appVersion ?? '–'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-700 dark:text-slate-300">
                      {device.phoneNumber ?? '–'}
                    </td>
                    <td className="px-4 py-3">
                      <DeviceStatusBadge status={device.status} />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                      {formatRelativeTime(device.lastSeen)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                      {device.messagesSent} / {device.messagesDelivered}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                      {device.batteryLevel != null ? `${device.batteryLevel}%` : '–'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handlePing(device.id)}
                          disabled={pingingId === device.id}
                          className="p-1.5 rounded-md text-slate-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-950 transition-colors"
                          title="Ping device"
                        >
                          <Zap className={`w-4 h-4 ${pingingId === device.id ? 'animate-pulse' : ''}`} />
                        </button>
                        <button
                          onClick={() => handleDelete(device.id)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                          title="Remove device"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showRegisterModal && (
        <RegisterDeviceModal
          token={idToken!}
          onClose={() => setShowRegisterModal(false)}
          onSuccess={() => { setShowRegisterModal(false); load(); }}
        />
      )}
    </div>
  );
}

function RegisterDeviceModal({
  token,
  onClose,
  onSuccess,
}: {
  token: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    projectId: '',
    fcmToken: '',
    phoneNumber: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, capabilities: ['sms'] }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register device');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
          Register Device
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { key: 'name', label: 'Device Name', placeholder: 'My Android Phone' },
            { key: 'projectId', label: 'Firebase Project ID', placeholder: 'my-project-123' },
            { key: 'fcmToken', label: 'FCM Registration Token', placeholder: 'ePx…' },
            { key: 'phoneNumber', label: 'Phone Number (optional)', placeholder: '+91XXXXXXXXXX' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {label}
              </label>
              <input
                type="text"
                placeholder={placeholder}
                value={form[key as keyof typeof form]}
                onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                className="input"
                required={key !== 'phoneNumber'}
              />
            </div>
          ))}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Registering…' : 'Register'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
