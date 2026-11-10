import type { ConnectionSettings } from '@/types/live';

export type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface ConnectionHandlers {
  onStateChange: (state: ConnectionState, detail: string) => void;
  onMessage: (data: unknown) => void;
}

const MAX_RETRY_DELAY_MS = 30_000;

export function buildEndpointUrl(settings: ConnectionSettings): string {
  return `ws://${settings.host}:${settings.port}/`;
}

export class TikFinityConnection {
  private socket: WebSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private active = false;

  constructor(
    private readonly settings: ConnectionSettings,
    private readonly handlers: ConnectionHandlers,
  ) {}

  start(): void {
    this.active = true;
    this.open();
  }

  stop(): void {
    this.active = false;
    this.clearRetryTimer();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.handlers.onStateChange('disconnected', 'Live connection is stopped.');
  }

  private open(): void {
    const url = buildEndpointUrl(this.settings);
    this.handlers.onStateChange(
      this.attempts === 0 ? 'connecting' : 'reconnecting',
      `Connecting to ${url}`,
    );

    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.attempts = 0;
      this.handlers.onStateChange('connected', `Listening on ${url}`);
    };

    socket.onmessage = (event: MessageEvent) => {
      this.handlers.onMessage(event.data);
    };

    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (this.active) this.scheduleRetry();
    };
  }

  private scheduleRetry(): void {
    this.attempts += 1;
    const delay = Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** Math.min(this.attempts - 1, 5));
    this.handlers.onStateChange(
      'reconnecting',
      `TikFinity is not reachable. Retrying in ${Math.round(delay / 1000)}s.`,
    );
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.active) this.open();
    }, delay);
  }

  private clearRetryTimer(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }
}
