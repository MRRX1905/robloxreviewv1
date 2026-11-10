import { Menu, Radio } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { APP_ROUTES } from '@/components/navigation/routes';
import type { RouteGroup } from '@/components/navigation/routes';
import SidebarNavigation from '@/components/navigation/SidebarNavigation';
import ConnectionIndicator from '@/components/navigation/ConnectionIndicator';

interface AppLayoutProps {
  currentPath: string;
  children: ReactNode;
}

const GROUP_ORDER: RouteGroup[] = ['Live', 'Review', 'Configure', 'Records'];

export default function AppLayout({ currentPath, children }: AppLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const current = APP_ROUTES.find((route) => route.path === currentPath);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-panel/80 backdrop-blur lg:flex">
        <SidebarNavigation currentPath={currentPath} groups={GROUP_ORDER} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 bg-canvas/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 flex-col border-r border-line bg-panel animate-slide-in-right">
            <SidebarNavigation
              currentPath={currentPath}
              groups={GROUP_ORDER}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-line bg-canvas/80 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-slate-300 hover:bg-raised lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Radio className="h-4 w-4 text-primary-400" aria-hidden="true" />
              <span className="hidden sm:inline">Roblox Live Stream Center</span>
              {current && (
                <>
                  <span className="hidden text-slate-600 sm:inline">/</span>
                  <span className="font-medium text-slate-100">{current.label}</span>
                </>
              )}
            </div>
          </div>
          <ConnectionIndicator />
        </header>

        <main className="flex-1 px-4 py-8 md:px-8 md:py-10">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
