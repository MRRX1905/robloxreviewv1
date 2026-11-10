import { Radio } from 'lucide-react';
import { APP_ROUTES, OVERLAY_PATH } from '@/components/navigation/routes';
import type { RouteGroup } from '@/components/navigation/routes';

interface SidebarNavigationProps {
  currentPath: string;
  groups: RouteGroup[];
  onNavigate?: () => void;
}

export default function SidebarNavigation({ currentPath, groups, onNavigate }: SidebarNavigationProps) {
  return (
    <nav aria-label="Main navigation" className="flex h-full flex-col gap-6 overflow-y-auto p-5">
      <div className="flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-accent-600 shadow-glow-primary">
          <Radio className="h-5 w-5 text-white" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight text-white">Live Stream Center</p>
          <p className="text-xs text-slate-500">Roblox review control</p>
        </div>
      </div>

      {groups.map((group) => {
        const items = APP_ROUTES.filter((route) => route.group === group);
        return (
          <div key={group} className="flex flex-col gap-1">
            <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{group}</p>
            {items.map((route) => {
              const active = route.path === currentPath;
              const Icon = route.icon;
              return (
                <a
                  key={route.path}
                  href={`#${route.path}`}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition duration-200 ${
                    active
                      ? 'bg-primary-500/15 text-white ring-1 ring-inset ring-primary-500/40'
                      : 'text-slate-400 hover:bg-raised hover:text-slate-100'
                  }`}
                >
                  {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary-400 shadow-glow-primary" />}
                  <Icon className={`h-4 w-4 transition ${active ? 'text-primary-300' : 'text-slate-500 group-hover:text-primary-300'}`} aria-hidden="true" />
                  {route.label}
                </a>
              );
            })}
          </div>
        );
      })}

      <div className="mt-auto rounded-xl border border-line bg-canvas/60 p-3 text-xs leading-relaxed text-slate-500">
        Overlay for OBS:{' '}
        <a href={`#${OVERLAY_PATH}`} className="text-primary-300 hover:text-primary-200">
          open the overlay page
        </a>
      </div>
    </nav>
  );
}
