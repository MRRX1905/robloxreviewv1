/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        canvas: '#050811',
        panel: '#0b1120',
        raised: '#101a2e',
        line: '#1c2942',
        primary: {
          50: '#eef6ff',
          100: '#d9eaff',
          200: '#bcdaff',
          300: '#8ec1ff',
          400: '#599dfc',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4fd0',
          800: '#1e41a8',
          900: '#1f3a86',
        },
        accent: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        success: {
          50: '#ecfdf5',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
        },
        warning: {
          50: '#fffbeb',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
        },
        danger: {
          50: '#fff1f2',
          300: '#fda4af',
          400: '#fb7185',
          500: '#f43f5e',
          600: '#e11d48',
        },
      },
      boxShadow: {
        'glow-primary': '0 0 0 1px rgba(59,130,246,0.35), 0 0 24px -4px rgba(59,130,246,0.45)',
        'glow-accent': '0 0 0 1px rgba(139,92,246,0.35), 0 0 24px -4px rgba(139,92,246,0.45)',
        'glow-success': '0 0 0 1px rgba(16,185,129,0.35), 0 0 20px -4px rgba(16,185,129,0.4)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(24px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 300ms ease-out both',
        'pulse-dot': 'pulse-dot 1.6s ease-in-out infinite',
        'slide-in-right': 'slide-in-right 350ms ease-out both',
      },
    },
  },
  plugins: [],
};
