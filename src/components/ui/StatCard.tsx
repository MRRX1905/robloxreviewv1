import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
  tone?: 'primary' | 'accent' | 'success' | 'warning';
}

const TONE_ICON: Record<NonNullable<StatCardProps['tone']>, string> = {
  primary: 'bg-primary-500/15 text-primary-300 ring-primary-500/30',
  accent: 'bg-accent-500/15 text-accent-300 ring-accent-500/30',
  success: 'bg-success-500/15 text-success-300 ring-success-500/30',
  warning: 'bg-warning-500/15 text-warning-300 ring-warning-500/30',
};

export default function StatCard({ label, value, hint, icon: Icon, tone = 'primary' }: StatCardProps) {
  return (
    <div className="glass-panel group flex items-start justify-between gap-4 p-5 transition duration-300 hover:-translate-y-0.5 hover:border-primary-500/40 animate-fade-in-up">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
        <p className="mt-2 truncate text-2xl font-bold text-white">{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </div>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${TONE_ICON[tone]}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
    </div>
  );
}
