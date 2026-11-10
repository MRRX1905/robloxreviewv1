import { useMemo, useState } from 'react';
import { ArrowDownToLine, Search } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import StateMessage from '@/components/ui/StateMessage';
import { useLive } from '@/context/live-context';
import { formatClockTime, formatNumber } from '@/lib/format';
import { sanitizeSearchTerm } from '@/lib/search';
import type { LiveEventType, LiveEventRecord } from '@/types/live';

const FILTERS: { value: LiveEventType | 'all'; label: string }[] = [
  { value: 'all', label: 'All events' },
  { value: 'chat', label: 'Chat' },
  { value: 'gift', label: 'Gifts' },
  { value: 'follow', label: 'Follows' },
  { value: 'like', label: 'Likes' },
  { value: 'share', label: 'Shares' },
  { value: 'subscribe', label: 'Subscriptions' },
];

const TYPE_TONE: Record<LiveEventType, 'primary' | 'accent' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  chat: 'primary',
  gift: 'accent',
  follow: 'success',
  like: 'danger',
  share: 'warning',
  subscribe: 'warning',
  unknown: 'neutral',
};

function describeEvent(event: LiveEventRecord): string {
  if (event.event_type === 'gift') {
    const quantity = event.gift_quantity > 1 ? ` x${event.gift_quantity}` : '';
    return `${event.gift_name ?? 'Gift'}${quantity}`;
  }
  if (event.event_type === 'chat') return event.message ?? '';
  return '';
}

export default function LiveMonitorPage() {
  const { events, connection } = useLive();
  const [filter, setFilter] = useState<LiveEventType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);

  const visible = useMemo(() => {
    const term = sanitizeSearchTerm(search).toLowerCase();
    return events
      .filter((event) => filter === 'all' || event.event_type === filter)
      .filter((event) => term === '' || event.tiktok_username.toLowerCase().includes(term) || (event.message ?? '').toLowerCase().includes(term))
      .slice()
      .reverse();
  }, [events, filter, search]);

  const connected = connection.state === 'connected';

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="Live Monitor"
        description="Every chat message, gift, follow, like, share, and subscription from your TikTok LIVE, as it arrives."
        actions={
          <Badge tone={connected ? 'success' : 'neutral'} dot={connected}>
            {connected ? 'Receiving events' : 'Not receiving events'}
          </Badge>
        }
      />

      <Card>
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter events by type">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                aria-pressed={filter === item.value}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition duration-200 ${
                  filter === item.value
                    ? 'bg-primary-500/20 text-primary-200 ring-1 ring-inset ring-primary-500/50'
                    : 'text-slate-400 ring-1 ring-inset ring-line hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <label className="relative">
              <span className="sr-only">Search events</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search username or message"
                className="field pl-9 sm:w-72"
              />
            </label>
            <Button variant={autoScroll ? 'primary' : 'secondary'} onClick={() => setAutoScroll((value) => !value)} icon={<ArrowDownToLine className="h-4 w-4" />}>
              Auto-scroll {autoScroll ? 'on' : 'off'}
            </Button>
          </div>
        </div>

        <p className="mb-3 text-xs text-slate-500">Showing {formatNumber(visible.length)} of {formatNumber(events.length)} events</p>

        {visible.length === 0 ? (
          <StateMessage
            kind="empty"
            title={events.length === 0 ? 'Waiting for events' : 'No events match these filters'}
            description={events.length === 0
              ? connected ? 'Events will appear here once your stream receives activity.' : 'Open TikFinity Desktop on this computer and connect it to your TikTok LIVE.'
              : 'Try a different filter or clear the search.'}
          />
        ) : (
          <div
            className="max-h-[32rem] overflow-y-auto rounded-xl border border-line/70 bg-canvas/50"
            ref={(node) => {
              if (node && autoScroll) node.scrollTop = 0;
            }}
          >
            <ul className="divide-y divide-line/60">
              {visible.map((event) => (
                <li key={event.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3 animate-fade-in-up">
                  <Badge tone={TYPE_TONE[event.event_type]}>{event.event_type}</Badge>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">@{event.tiktok_username}</p>
                    <p className="truncate text-sm text-slate-400">{describeEvent(event)}</p>
                  </div>
                  <span className="font-mono text-xs text-slate-500">{formatClockTime(event.occurred_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  );
}
