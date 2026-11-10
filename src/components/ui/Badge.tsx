import type { ReactNode } from 'react';

export type BadgeTone = 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'neutral';

const TONE_CLASSES: Record<BadgeTone, string> = {
  primary: 'bg-primary-500/15 text-primary-300 ring-primary-500/30',
  accent: 'bg-accent-500/15 text-accent-300 ring-accent-500/30',
  success: 'bg-success-500/15 text-success-300 ring-success-500/30',
  warning: 'bg-warning-500/15 text-warning-300 ring-warning-500/30',
  danger: 'bg-danger-500/15 text-danger-300 ring-danger-500/30',
  neutral: 'bg-slate-500/15 text-slate-300 ring-slate-500/30',
};

interface BadgeProps {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
}

export default function Badge({ tone = 'neutral', dot = false, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONE_CLASSES[tone]}`}
    >
      {dot && <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-current" />}
      {children}
    </span>
  );
}
