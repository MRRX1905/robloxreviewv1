import {
  Activity,
  Gift,
  History,
  LayoutDashboard,
  ListOrdered,
  MonitorPlay,
  Mic2,
  ScanSearch,
  Settings,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type RouteGroup = 'Live' | 'Review' | 'Configure' | 'Records';

export interface RouteDefinition {
  path: string;
  label: string;
  icon: LucideIcon;
  group: RouteGroup;
}

export const APP_ROUTES: RouteDefinition[] = [
  { path: '/overview', label: 'Overview', icon: LayoutDashboard, group: 'Live' },
  { path: '/monitor', label: 'Live Monitor', icon: Activity, group: 'Live' },
  { path: '/queue', label: 'Review Queue', icon: ListOrdered, group: 'Review' },
  { path: '/analyzer', label: 'Account Analyzer', icon: ScanSearch, group: 'Review' },
  { path: '/gifts', label: 'Gift Configuration', icon: Gift, group: 'Configure' },
  { path: '/ai-voice', label: 'AI & Voice', icon: Mic2, group: 'Configure' },
  { path: '/obs', label: 'OBS Overlay', icon: MonitorPlay, group: 'Configure' },
  { path: '/history', label: 'Review History', icon: History, group: 'Records' },
  { path: '/settings', label: 'System Settings', icon: Settings, group: 'Records' },
];

export const OVERLAY_PATH = '/overlay';

export const DEFAULT_PATH = '/overview';
