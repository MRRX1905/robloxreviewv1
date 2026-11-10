import type { ComponentType } from 'react';
import AppLayout from '@/layouts/AppLayout';
import LiveProvider from '@/context/LiveProvider';
import useHashPath, { isOverlayPath } from '@/hooks/useHashPath';
import { DEFAULT_PATH } from '@/components/navigation/routes';
import OverviewPage from '@/pages/OverviewPage';
import LiveMonitorPage from '@/pages/LiveMonitorPage';
import ReviewQueuePage from '@/pages/ReviewQueuePage';
import AnalyzerPage from '@/pages/AnalyzerPage';
import GiftConfigPage from '@/pages/GiftConfigPage';
import AiVoicePage from '@/pages/AiVoicePage';
import ObsOverlayPage from '@/pages/ObsOverlayPage';
import ReviewHistoryPage from '@/pages/ReviewHistoryPage';
import SystemSettingsPage from '@/pages/SystemSettingsPage';
import OverlayPage from '@/pages/OverlayPage';

const PAGES: Record<string, ComponentType> = {
  '/overview': OverviewPage,
  '/monitor': LiveMonitorPage,
  '/queue': ReviewQueuePage,
  '/analyzer': AnalyzerPage,
  '/gifts': GiftConfigPage,
  '/ai-voice': AiVoicePage,
  '/obs': ObsOverlayPage,
  '/history': ReviewHistoryPage,
  '/settings': SystemSettingsPage,
};

export default function App() {
  const path = useHashPath();

  if (isOverlayPath(path)) {
    return <OverlayPage />;
  }

  const Page = PAGES[path] ?? PAGES[DEFAULT_PATH];
  const currentPath = PAGES[path] ? path : DEFAULT_PATH;

  return (
    <LiveProvider>
      <AppLayout currentPath={currentPath}>
        <Page />
      </AppLayout>
    </LiveProvider>
  );
}
