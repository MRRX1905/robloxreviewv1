import { useLive } from '@/context/live-context';
import Badge from '@/components/ui/Badge';
import type { BadgeTone } from '@/components/ui/Badge';
import type { ConnectionState } from '@/services/tikfinity/tikfinity-connection';

const STATE_DISPLAY: Record<ConnectionState, { label: string; tone: BadgeTone }> = {
  connected: { label: 'TikFinity connected', tone: 'success' },
  connecting: { label: 'Connecting', tone: 'primary' },
  reconnecting: { label: 'Reconnecting', tone: 'warning' },
  disconnected: { label: 'Not connected', tone: 'neutral' },
};

export default function ConnectionIndicator() {
  const { connection } = useLive();
  const display = STATE_DISPLAY[connection.state];
  return (
    <div title={connection.detail} className="hidden sm:block">
      <Badge tone={display.tone} dot={connection.state !== 'disconnected'}>
        {display.label}
      </Badge>
    </div>
  );
}
