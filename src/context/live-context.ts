import { createContext, useContext } from 'react';
import type { ConnectionState } from '@/services/tikfinity/tikfinity-connection';
import type { ConnectionSettings, GiftRule, LiveEventRecord, ReviewQueueEntry } from '@/types/live';

export interface DiagnosticEntry {
  id: string;
  receivedAt: string;
  recognized: boolean;
  preview: string;
}

export interface Notice {
  id: string;
  createdAt: string;
  text: string;
  tone: 'info' | 'error';
}

export interface LiveContextValue {
  connection: {
    state: ConnectionState;
    detail: string;
    settings: ConnectionSettings | null;
  };
  events: LiveEventRecord[];
  diagnostics: DiagnosticEntry[];
  notices: Notice[];
  queue: ReviewQueueEntry[];
  giftRules: GiftRule[];
  queueLoading: boolean;
  refreshQueue: () => Promise<void>;
  refreshGiftRules: () => Promise<void>;
  updateConnectionSettings: (settings: ConnectionSettings) => Promise<void>;
  reportError: (text: string) => void;
}

export const LiveContext = createContext<LiveContextValue | null>(null);

export function useLive(): LiveContextValue {
  const value = useContext(LiveContext);
  if (!value) throw new Error('useLive must be used inside LiveProvider.');
  return value;
}
