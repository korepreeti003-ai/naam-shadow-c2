import { cn } from '@/lib/utils';
import type { CampaignStatus } from '@/types';

const STATUS_CONFIG: Record<
  CampaignStatus,
  { label: string; className: string; dotClass?: string }
> = {
  draft: {
    label: 'Draft',
    className: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
  },
  scheduled: {
    label: 'Scheduled',
    className: 'bg-violet-50 dark:bg-violet-950 text-violet-700 dark:text-violet-400',
    dotClass: 'bg-violet-500',
  },
  queued: {
    label: 'Queued',
    className: 'bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-400',
    dotClass: 'bg-blue-500',
  },
  running: {
    label: 'Running',
    className: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400',
    dotClass: 'bg-amber-500 animate-pulse',
  },
  paused: {
    label: 'Paused',
    className: 'bg-orange-50 dark:bg-orange-950 text-orange-700 dark:text-orange-400',
    dotClass: 'bg-orange-400',
  },
  completed: {
    label: 'Completed',
    className: 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400',
    dotClass: 'bg-emerald-500',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-500',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-400',
    dotClass: 'bg-red-500',
  },
};

interface CampaignStatusBadgeProps {
  status: CampaignStatus;
}

export function CampaignStatusBadge({ status }: CampaignStatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span className={cn('badge', config.className)}>
      {config.dotClass && <span className={cn('status-dot', config.dotClass)} />}
      {config.label}
    </span>
  );
}
