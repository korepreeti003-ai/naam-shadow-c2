import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  subLabel?: string;
  icon: LucideIcon;
  iconColor?: string;
  trend?: { value: number; label: string };
  className?: string;
}

export function StatCard({
  label,
  value,
  subLabel,
  icon: Icon,
  iconColor = 'text-brand-500',
  trend,
  className,
}: StatCardProps) {
  return (
    <div className={cn('card p-6', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">{value}</p>
          {subLabel && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subLabel}</p>
          )}
          {trend && (
            <p
              className={cn(
                'text-xs font-medium mt-2',
                trend.value >= 0 ? 'text-emerald-600' : 'text-red-500'
              )}
            >
              {trend.value >= 0 ? '+' : ''}
              {trend.value}% {trend.label}
            </p>
          )}
        </div>
        <div
          className={cn(
            'w-12 h-12 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-700',
            iconColor.replace('text-', 'bg-').replace('-500', '-50') + ' dark:bg-slate-700'
          )}
        >
          <Icon className={cn('w-6 h-6', iconColor)} />
        </div>
      </div>
    </div>
  );
}
