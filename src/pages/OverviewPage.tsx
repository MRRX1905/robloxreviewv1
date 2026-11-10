import { useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Clock, Coins, ListOrdered, MonitorPlay, Mic, Radio, ScanSearch, Gift } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import StatCard from '@/components/ui/StatCard';
import StateMessage from '@/components/ui/StateMessage';
import { useLive } from '@/context/live-context';
import { loadDashboardStats } from '@/services/data/dashboard-stats';
import { listLiveEventsSince } from '@/services/data/live-events';
import { formatClockTime, formatDuration, formatNumber, formatRelativeTime } from '@/lib/format';
import { DEFAULT_REVIEW_SECONDS, TIER_LABEL } from '@/lib/review-queue';
import type { DashboardStats } from '@/services/data/dashboard-stats';
import type { LiveEventRecord } from '@/types/live';

interface HourBucket {
  hour: string;
  events: number;
}

function bucketByHour(rows: Pick<LiveEventRecord, 'occurred_at'>[]): HourBucket[] {
  const buckets = new Map<string, number>();
  const now = new Date();
  for (let offset = 23; offset >= 0; offset -= 1) {
    const hour = new Date(now.getTime() - offset * 3600_000);
    buckets.set(`${hour.getHours().toString().padStart(2, '0')}:00`, 0);
  }
  for (const row of rows) {
    const label = `${new Date(row.occurred_at).getHours().toString().padStart(2, '0')}:00`;
    if (buckets.has(label)) buckets.set(label, (buckets.get(label) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([hour, events]) => ({ hour, events }));
}

function EventActivityChart() {
  const [buckets, setBuckets] = useState<HourBucket[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    listLiveEventsSince(since, 5000)
      .then((rows) => setBuckets(bucketByHour(rows)))
      .catch((caught: Error) => setError(caught.message));
  }, []);

  if (error) return <StateMessage kind="error" title="Activity could not be loaded" description={error} />;
  if (!buckets) return <StateMessage kind="loading" title="Loading activity" />;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={buckets} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1c2942" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="hour" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} interval={3} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={{ background: '#0b1120', border: '1px solid #1c2942', borderRadius: 8, color: '#e2e8f0' }} />
          <Area type="monotone" dataKey="events" name="Events" stroke="#3b82f6" strokeWidth={2} fill="url(#activityFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function StatusRow({ label, ok, detail }: { label: string; ok: boolean | null; detail: string }) {
  const tone = ok === null ? 'neutral' : ok ? 'success' : 'warning';
  const text = ok === null ? 'Checking' : ok ? 'Ready' : 'Attention';
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/60 py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-200">{label}</p>
        <p className="truncate text-xs text-slate-500">{detail}</p>
      </div>
      <Badge tone={tone} dot={ok !== null}>{text}</Badge>
    </div>
  );
}

export default function OverviewPage() {
  const { connection, events, queue, queueLoading } = useLive();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardStats()
      .then(setStats)
      .catch((caught: Error) => setStatsError(caught.message));
  }, []);

  const waiting = useMemo(() => queue.filter((entry) => entry.status === 'waiting').length, [queue]);
  const spotlight = queue.find((entry) => entry.status === 'in_review') ?? null;
  const recentEvents = events.slice(0, 6);
  const speechAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const liveConnected = connection.state === 'connected';

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="Overview"
        description="Today's review activity, the live queue, and the status of every connected service at a glance."
        actions={
          <Badge tone={liveConnected ? 'success' : connection.state === 'reconnecting' ? 'warning' : 'neutral'} dot={liveConnected}>
            {liveConnected ? 'LIVE connected' : 'LIVE offline'}
          </Badge>
        }
      />

      {statsError && (
        <div className="mb-6">
          <StateMessage kind="error" title="Some statistics are unavailable" description={statsError} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Reviews today" value={stats ? formatNumber(stats.reviewsToday) : '…'} icon={CheckCircle2} tone="success" hint="Completed reviews since midnight" />
        <StatCard label="Gifts received" value={stats ? formatNumber(stats.giftsReceived) : '…'} icon={Gift} tone="accent" hint={stats ? `${formatNumber(stats.giftCoins)} coins total` : 'Validated gifts'} />
        <StatCard label="Accounts reviewed" value={stats ? formatNumber(stats.accountsReviewed) : '…'} icon={ScanSearch} hint="All completed reviews" />
        <StatCard label="Current queue" value={queueLoading ? '…' : formatNumber(waiting)} icon={ListOrdered} hint="Viewers waiting for a review" />
        <StatCard
          label="Average review"
          value={stats?.averageReviewSeconds != null ? formatDuration(stats.averageReviewSeconds) : formatDuration(DEFAULT_REVIEW_SECONDS)}
          icon={Clock}
          tone="warning"
          hint={stats?.averageReviewSeconds != null ? 'From completed reviews' : 'Default until reviews are completed'}
        />
        <StatCard label="Coins tracked" value={stats ? formatNumber(stats.giftCoins) : '…'} icon={Coins} hint="Sum of validated gift values" />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Card title="Event activity" description="Live events received in the last 24 hours, per hour.">
            <EventActivityChart />
          </Card>

          <Card title="Recent LIVE events" description="The latest events from your TikTok stream.">
            {recentEvents.length === 0 ? (
              <StateMessage
                kind="empty"
                title="No events yet"
                description={connection.state === 'connected'
                  ? 'TikFinity is connected. Events will appear here as they arrive.'
                  : 'Start TikFinity Desktop on this computer and go live to receive events.'}
              />
            ) : (
              <ul className="divide-y divide-line/60">
                {recentEvents.map((event) => (
                  <li key={event.id} className="flex items-center justify-between gap-4 py-3 animate-fade-in-up">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-slate-200">
                        <span className="font-medium text-white">@{event.tiktok_username}</span>{' '}
                        <span className="text-slate-400">
                          {event.event_type === 'gift' ? `sent ${event.gift_name ?? 'a gift'}` : event.event_type === 'chat' ? `said "${event.message ?? ''}"` : `${event.event_type}ed the stream`}
                        </span>
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-xs text-slate-500" title={formatClockTime(event.occurred_at)}>
                      {formatRelativeTime(event.occurred_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Active review spotlight" description="The account currently being reviewed.">
            {spotlight ? (
              <div className="rounded-xl border border-primary-500/30 bg-primary-500/5 p-4 shadow-glow-primary">
                <p className="text-xs uppercase tracking-wider text-primary-300">{TIER_LABEL[spotlight.tier]}</p>
                <p className="mt-2 text-lg font-semibold text-white">{spotlight.roblox_username}</p>
                <p className="text-sm text-slate-400">Submitted by @{spotlight.tiktok_username}</p>
              </div>
            ) : (
              <StateMessage kind="empty" title="No review in progress" description="Start a review from the Review Queue to spotlight it here." />
            )}
          </Card>

          <Card title="System status" description="Services used by the live review workflow.">
            <StatusRow label="TikFinity connection" ok={liveConnected ? true : connection.state === 'disconnected' ? false : null} detail={connection.detail} />
            <StatusRow label="Text-to-speech" ok={speechAvailable} detail={speechAvailable ? 'Browser voice engine available' : 'This browser has no voice engine'} />
            <StatusRow label="OBS overlay" ok={true} detail="Add the overlay page as a Browser Source" />
            <StatusRow label="Database" ok={statsError === null && stats !== null ? true : statsError ? false : null} detail={statsError ?? 'Connected'} />
          </Card>

          <Card title="Connection tools">
            <div className="flex items-center gap-3 rounded-lg border border-line bg-canvas/60 p-3 text-sm text-slate-400">
              <Radio className="h-4 w-4 text-primary-400" aria-hidden="true" />
              <span>{connection.detail}</span>
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-canvas/60 p-3 text-sm text-slate-400">
              <MonitorPlay className="h-4 w-4 text-accent-400" aria-hidden="true" />
              <span>Latest events: {formatNumber(events.length)} in view</span>
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-canvas/60 p-3 text-sm text-slate-400">
              <Mic className="h-4 w-4 text-primary-400" aria-hidden="true" />
              <span>Activity feed updates in real time</span>
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-canvas/60 p-3 text-sm text-slate-400">
              <Activity className="h-4 w-4 text-success-400" aria-hidden="true" />
              <span>Queue updates: {queue.length} active entries</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
