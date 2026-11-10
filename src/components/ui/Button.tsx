import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-500 shadow-glow-primary/0 hover:shadow-glow-primary',
  secondary: 'bg-raised text-slate-200 ring-1 ring-inset ring-line hover:ring-primary-500/50 hover:text-white',
  danger: 'bg-danger-600/90 text-white hover:bg-danger-500',
  ghost: 'text-slate-300 hover:bg-raised hover:text-white',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: ReactNode;
}

export default function Button({ variant = 'secondary', icon, className = '', children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}
