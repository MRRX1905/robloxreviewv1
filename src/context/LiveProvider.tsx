import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { LiveContext } from '@/context/live-context';
import type { DiagnosticEntry, LiveContextValue, Notice } from '@/context/live-context';
import { supabase } from '@/lib/supabase';
import { getAppSetting, saveAppSetting } from '@/services/data/app-settings';
import { listGiftRules } from '@/services/data/gift-rules';
import { listRecentLiveEvents } from '@/services/data/live-events';
import { listActiveQueue } from '@/services/data/review-queue';
import { normalizeTikFinityMessage } from '@/services/tikfinity/event-normalizer';
import { processLiveEvent } from '@/services/tikfinity/tikfinity-events';
import { TikFinityConnection } from '@/services/tikfinity/tikfinity-connection';
import type { ConnectionState } from '@/services/tikfinity/tikfinity-connection';
import type { ConnectionSettings, GiftRule, LiveEventRecord, ReviewQueueEntry } from '@/types/live';

const CONNECTION_SETTINGS_KEY = 'tikfinity_connection';
const DEFAULT_CONNECTION: ConnectionSettings = { host: 'localhost', port: 21213 };
const FEED_LIMIT = 300;
const DIAGNOSTIC_LIMIT = 100;
const NOTICE_LIMIT = 20;

function createId(): string {
  return crypto.randomUUID();
}

function describeMessage(data: unknown): string {
  if (typeof data === 'string') return data.slice(0, 400);
  return `[${typeof data} message]`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export default function LiveProvider({ children }: { children: ReactNode }) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [connectionDetail, setConnectionDetail] = useState('Loading connection settings');
  const [settings, setSettings] = useState<ConnectionSettings | null>(null);
  const [events, setEvents] = useState<LiveEventRecord[]>([]);
  const [diagnostics, setDiagnostics] = useState<DiagnosticEntry[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [queue, setQueue] = useState<ReviewQueueEntry[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [giftRules, setGiftRules] = useState<GiftRule[]>([]);

  const giftRulesRef = useRef<GiftRule[]>([]);
  const processingChain = useRef<Promise<void>>(Promise.resolve());

  const addNotice = useCallback((text: string, tone: Notice['tone'] = 'info') => {
    setNotices((previous) => [
      { id: createId(), createdAt: new Date().toISOString(), text, tone },
      ...previous,
    ].slice(0, NOTICE_LIMIT));
  }, []);

  const refreshQueue = useCallback(async () => {
    try {
      setQueue(await listActiveQueue());
    } catch (error) {
      addNotice(errorText(error), 'error');
    } finally {
      setQueueLoading(false);
    }
  }, [addNotice]);

  const refreshGiftRules = useCallback(async () => {
    try {
      const rules = await listGiftRules();
      giftRulesRef.current = rules;
      setGiftRules(rules);
    } catch (error) {
      addNotice(errorText(error), 'error');
    }
  }, [addNotice]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [savedSettings, recentEvents] = await Promise.all([
          getAppSetting<ConnectionSettings>(CONNECTION_SETTINGS_KEY),
          listRecentLiveEvents(FEED_LIMIT),
        ]);
        if (cancelled) return;
        setSettings(savedSettings ?? DEFAULT_CONNECTION);
        setEvents(recentEvents);
      } catch (error) {
        if (!cancelled) {
          setSettings(DEFAULT_CONNECTION);
          addNotice(errorText(error), 'error');
        }
      }
      if (!cancelled) {
        await Promise.all([refreshQueue(), refreshGiftRules()]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addNotice, refreshQueue, refreshGiftRules]);

  useEffect(() => {
    const channel = supabase
      .channel('review-queue-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'review_queue' }, () => {
        void refreshQueue();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshQueue]);

  const handleIncomingMessage = useCallback((data: unknown) => {
    const normalized = normalizeTikFinityMessage(data);
    setDiagnostics((previous) => [
      {
        id: createId(),
        receivedAt: new Date().toISOString(),
        recognized: normalized !== null,
        preview: describeMessage(data),
      },
      ...previous,
    ].slice(0, DIAGNOSTIC_LIMIT));
    if (!normalized) return;

    processingChain.current = processingChain.current.then(async () => {
      try {
        const result = await processLiveEvent(normalized, {
          getGiftRules: () => giftRulesRef.current,
          onQueueChanged: () => void refreshQueue(),
        });
        if (result.status === 'stored') {
          setEvents((previous) => [result.event, ...previous].slice(0, FEED_LIMIT));
          if (result.note) addNotice(result.note);
        }
      } catch (error) {
        addNotice(errorText(error), 'error');
      }
    });
  }, [addNotice, refreshQueue]);

  useEffect(() => {
    if (!settings) return;
    const connection = new TikFinityConnection(settings, {
      onStateChange: (state, detail) => {
        setConnectionState(state);
        setConnectionDetail(detail);
      },
      onMessage: handleIncomingMessage,
    });
    connection.start();
    return () => connection.stop();
  }, [settings, handleIncomingMessage]);

  const updateConnectionSettings = useCallback(async (next: ConnectionSettings) => {
    await saveAppSetting(CONNECTION_SETTINGS_KEY, next);
    setSettings(next);
  }, []);

  const value = useMemo<LiveContextValue>(() => ({
    connection: { state: connectionState, detail: connectionDetail, settings },
    events,
    diagnostics,
    notices,
    queue,
    giftRules,
    queueLoading,
    refreshQueue,
    refreshGiftRules,
    updateConnectionSettings,
    reportError: (text: string) => addNotice(text, 'error'),
  }), [
    connectionState,
    connectionDetail,
    settings,
    events,
    diagnostics,
    notices,
    queue,
    giftRules,
    queueLoading,
    refreshQueue,
    refreshGiftRules,
    updateConnectionSettings,
    addNotice,
  ]);

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}
