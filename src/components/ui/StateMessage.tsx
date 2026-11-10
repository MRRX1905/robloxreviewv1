import type { ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';

interface StateMessageProps {
  kind: 'loading' | 'empty' | 'error';
  title: string;
  description?: string;
  action?: ReactNode;
}

const ICONS = {
  loading: Loader2,
  empty: Inbox,
  error: AlertTriangle,
};

const ICON_CLASSES = {
  loading: 'text-primary-400 animate-spin',
  empty: 'text-slate-500',
  error: 'text-danger-400',
};

export default function StateMessage({ kind, title, description, action }: StateMessageProps) {
  const Icon = ICONS[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center animate-fade-in-up">
      <Icon className={`h-8 w-8 ${ICON_CLASSES[kind]}`} aria-hidden="true" />
      <p className="text-sm font-medium text-slate-200">{title}</p>
      {description && <p className="max-w-md text-sm leading-relaxed text-slate-400">{description}</p>}
      {action}
    </div>
  );
}
