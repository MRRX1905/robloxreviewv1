import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function Card({ title, description, action, children, className = '' }: CardProps) {
  return (
    <section className={`glass-panel p-6 ${className}`}>
      {(title || action) && (
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-base font-semibold text-slate-100">{title}</h2>}
            {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
