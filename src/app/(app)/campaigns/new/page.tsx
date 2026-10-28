'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Upload,
  MessageSquare,
  Smartphone,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { useAuth } from '@/components/auth-provider';
import { calculateSmsSegments } from '@/lib/csv';
import type { Device } from '@/types';

const STEPS = [
  { id: 1, label: 'Upload Contacts', icon: Upload },
  { id: 2, label: 'Compose Message', icon: MessageSquare },
  { id: 3, label: 'Select Devices', icon: Smartphone },
  { id: 4, label: 'Confirm & Launch', icon: CheckCircle2 },
];

interface UploadResult {
  batchId: string;
  fileName: string;
  summary: { total: number; valid: number; invalid: number; duplicates: number; optedOut: number };
  preview: Array<{ phone: string; name?: string }>;
}

export default function NewCampaignPage() {
  const router = useRouter();
  const { idToken } = useAuth();
  const [step, setStep] = useState(1);

  // Step 1
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  // Step 2
  const [campaignName, setCampaignName] = useState('');
  const [message, setMessage] = useState('');
  const smsInfo = calculateSmsSegments(message);

  // Step 3
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [devicesLoaded, setDevicesLoaded] = useState(false);

  // Step 4
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !idToken) return;

    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/contacts/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setUploadResult(json.data);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function loadDevices() {
    if (!idToken || devicesLoaded) return;
    try {
      const res = await fetch('/api/devices?pageSize=50', {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const json = await res.json();
      if (json.success) {
        setDevices(json.data.items);
        setDevicesLoaded(true);
      }
    } catch {
      // pass
    }
  }

  function goToStep(s: number) {
    setStep(s);
    if (s === 3) loadDevices();
  }

  async function handleCreate() {
    if (!idToken || !uploadResult) return;
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          name: campaignName,
          message,
          projectId: devices.find((d) => selectedDevices.includes(d.id))?.projectId ?? '',
          deviceIds: selectedDevices,
          batchId: uploadResult.batchId,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      router.push('/campaigns');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create campaign');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">New Campaign</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Follow the steps to set up and launch a campaign
        </p>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2">
        {STEPS.map(({ id, label, icon: Icon }, i) => (
          <div key={id} className="flex items-center gap-2 flex-1">
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                step === id
                  ? 'bg-brand-600 text-white'
                  : step > id
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="card p-6">
        {/* Step 1: Upload */}
        {step === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Upload Contact CSV
            </h2>
            <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl p-8 text-center">
              <FileText className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Drop a CSV file or{' '}
                <label className="text-brand-600 cursor-pointer hover:underline">
                  browse
                  <input
                    type="file"
                    accept=".csv"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                </label>
              </p>
              <p className="text-xs text-slate-400 mt-1">CSV with phone, name columns · Max 10 MB (~10,000 contacts)</p>
            </div>

            {uploading && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <div className="w-4 h-4 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
                Uploading and validating…
              </div>
            )}

            {uploadError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950 rounded-lg text-red-700 dark:text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                {uploadError}
              </div>
            )}

            {uploadResult && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Total', value: uploadResult.summary.total },
                    { label: 'Valid', value: uploadResult.summary.valid, green: true },
                    { label: 'Invalid', value: uploadResult.summary.invalid, red: true },
                    { label: 'Duplicates', value: uploadResult.summary.duplicates },
                  ].map(({ label, value, green, red }) => (
                    <div
                      key={label}
                      className={`p-3 rounded-lg text-center ${
                        green ? 'bg-emerald-50 dark:bg-emerald-950' :
                        red ? 'bg-red-50 dark:bg-red-950' :
                        'bg-slate-50 dark:bg-slate-800'
                      }`}
                    >
                      <p className={`text-xl font-bold ${
                        green ? 'text-emerald-700 dark:text-emerald-400' :
                        red ? 'text-red-600 dark:text-red-400' :
                        'text-slate-900 dark:text-white'
                      }`}>
                        {value}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                    </div>
                  ))}
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Preview (first 5)
                  </p>
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    {uploadResult.preview.slice(0, 5).map((row, i) => (
                      <div
                        key={i}
                        className="px-4 py-2 text-sm flex gap-4 border-b border-slate-100 dark:border-slate-800 last:border-0"
                      >
                        <span className="font-mono text-slate-700 dark:text-slate-300">
                          {row.phone}
                        </span>
                        {row.name && (
                          <span className="text-slate-500 dark:text-slate-400">{row.name}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Message */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Compose Message
            </h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Campaign Name
              </label>
              <input
                type="text"
                placeholder="e.g. June Promo Blast"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Message
              </label>
              <textarea
                rows={5}
                placeholder="Enter your SMS message…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="input resize-none"
              />
              <div className="flex justify-between mt-1 text-xs text-slate-400">
                <span>
                  {smsInfo.chars} chars · {smsInfo.encoding} · {smsInfo.segments} segment{smsInfo.segments !== 1 ? 's' : ''}
                </span>
                <span>{smsInfo.segments > 1 && `Each segment ≈ 153 chars`}</span>
              </div>
            </div>

            {/* Preview bubble */}
            {message && (
              <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Preview</p>
                <div className="bg-white dark:bg-slate-700 rounded-xl rounded-tl-none px-4 py-3 text-sm text-slate-900 dark:text-white max-w-sm shadow-sm">
                  {message}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Devices */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Select Sending Devices
            </h2>
            {devices.length === 0 ? (
              <p className="text-sm text-slate-400">
                No devices available. Register at least one device first.
              </p>
            ) : (
              <div className="space-y-2">
                {devices.map((device) => {
                  const selected = selectedDevices.includes(device.id);
                  const available = ['online', 'idle'].includes(device.status);
                  return (
                    <label
                      key={device.id}
                      className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                        selected
                          ? 'border-brand-500 bg-brand-50 dark:bg-brand-950'
                          : 'border-slate-200 dark:border-slate-700 hover:border-brand-300'
                      } ${!available ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={!available}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDevices((prev) => [...prev, device.id]);
                          } else {
                            setSelectedDevices((prev) => prev.filter((id) => id !== device.id));
                          }
                        }}
                        className="w-4 h-4 accent-brand-600"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {device.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {device.phoneNumber ?? 'No phone'} · {device.status}
                        </p>
                      </div>
                      <div
                        className={`w-2 h-2 rounded-full ${
                          available ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}
                      />
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Confirm */}
        {step === 4 && uploadResult && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              Confirm & Launch
            </h2>
            <div className="space-y-3">
              {[
                { label: 'Campaign', value: campaignName },
                { label: 'Recipients', value: `${uploadResult.summary.valid} valid contacts` },
                { label: 'Message length', value: `${smsInfo.chars} chars · ${smsInfo.segments} SMS segment${smsInfo.segments !== 1 ? 's' : ''}` },
                { label: 'Sending via', value: `${selectedDevices.length} device${selectedDevices.length !== 1 ? 's' : ''}` },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{value}</span>
                </div>
              ))}
            </div>

            <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Campaign will be created as a draft. You can start it from the campaigns list.
                Only contacts with valid phone numbers and consent will receive messages.
              </p>
            </div>

            {createError && (
              <p className="text-sm text-red-500 bg-red-50 dark:bg-red-950 rounded-lg p-3">
                {createError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => goToStep(step - 1)}
          className="btn-secondary"
          disabled={step === 1}
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        {step < 4 ? (
          <button
            onClick={() => goToStep(step + 1)}
            className="btn-primary"
            disabled={
              (step === 1 && !uploadResult) ||
              (step === 2 && (!campaignName || !message)) ||
              (step === 3 && selectedDevices.length === 0)
            }
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleCreate}
            className="btn-primary"
            disabled={creating}
          >
            {creating ? 'Creating…' : 'Create Campaign'}
          </button>
        )}
      </div>
    </div>
  );
}
