import { cn } from '@/lib/utils';
import type { DeviceStatus } from '@/types';

const STATUS_CONFIG: Record<DeviceStatus, { label: string; dot: string; badge: string }> = {
  online: {
    label: 'Online',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400',
  },
  idle: {
    label: 'Idle',
    dot: 'bg-emerald-400',
    badge: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400',
  },
  busy: {
    label: 'Busy',
    dot: 'bg-amber-500 animate-pulse',
    badge: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400',
  },
  offline: {
    label: 'Offline',
    dot: 'bg-slate-400',
    badge: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
  },
  error: {
    label: 'Error',
    dot: 'bg-red-500',
    badge: 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400',
  },
};

interface DeviceStatusBadgeProps {
  status: DeviceStatus;
  showLabel?: boolean;
}

export function DeviceStatusBadge({ status, showLabel = true }: DeviceStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.offline;
  return (
    <span className={cn('badge', config.badge)}>
      <span className={cn('status-dot', config.dot)} />
      {showLabel && config.label}
    </span>
  );
}
