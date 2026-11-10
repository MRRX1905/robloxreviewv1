import { useMemo, useState } from 'react';
import { CheckCheck, Play, Trash2, X } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import StateMessage from '@/components/ui/StateMessage';
import { useLive } from '@/context/live-context';
import { DEFAULT_REVIEW_SECONDS, TIER_LABEL, estimateWaitSeconds, sortWaitingQueue } from '@/lib/review-queue';
import { formatDuration, formatRelativeTime } from '@/lib/format';
import { cancelReview, completeReview, removeFromQueue, startReview } from '@/services/data/review-queue';
import type { ReviewQueueEntry, QueueTier } from '@/types/live';

const TIER_TONE: Record<QueueTier, 'accent' | 'warning' | 'primary'> = {
  vip_express: 'accent',
  fast_track: 'warning',
  normal: 'primary',
};

type ActionKind = 'start' | 'complete' | 'cancel' | 'remove';

export default function ReviewQueuePage() {
  const { queue, queueLoading, refreshQueue, reportError } = useLive();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const waiting = useMemo(() => sortWaitingQueue(queue), [queue]);
  const inReview = queue.find((entry) => entry.status === 'in_review') ?? null;

  async function runAction(entry: ReviewQueueEntry, action: ActionKind) {
    setBusyId(entry.id);
    setMessage(null);
    try {
      if (action === 'start') await startReview(entry);
      if (action === 'complete') await completeReview(entry);
      if (action === 'cancel') await cancelReview(entry);
      if (action === 'remove') await removeFromQueue(entry);
      await refreshQueue();
    } catch (error) {
      const text = error instanceof Error ? error.message : 'The action could not be completed.';
      setMessage(text);
      reportError(text);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="Review Queue"
        description="Viewers join with !review in TikTok LIVE chat. VIP Express goes first, then Fast Track, then Normal, in the order they joined."
        actions={<Badge tone="primary">{waiting.length} waiting</Badge>}
      />

      {message && (
        <div className="mb-6">
          <StateMessage kind="error" title="Action not completed" description={message} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Now reviewing" description="Only one account is reviewed at a time." className="xl:col-span-1">
          {inReview ? (
            <div className="flex flex-col gap-4 rounded-xl border border-primary-500/30 bg-primary-500/5 p-5 shadow-glow-primary">
              <Badge tone={TIER_TONE[inReview.tier]}>{TIER_LABEL[inReview.tier]}</Badge>
              <div>
                <p className="text-xl font-semibold text-white">{inReview.roblox_username}</p>
                <p className="mt-1 text-sm text-slate-400">@{inReview.tiktok_username}</p>
                <p className="mt-2 text-xs text-slate-500">Started {inReview.started_at ? formatRelativeTime(inReview.started_at) : 'just now'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" icon={<CheckCheck className="h-4 w-4" />} disabled={busyId === inReview.id} onClick={() => runAction(inReview, 'complete')}>
                  Finish review
                </Button>
                <Button variant="secondary" icon={<X className="h-4 w-4" />} disabled={busyId === inReview.id} onClick={() => runAction(inReview, 'cancel')}>
                  Cancel review
                </Button>
              </div>
            </div>
          ) : (
            <StateMessage kind="empty" title="Nobody is being reviewed" description="Press Start review on a viewer in the queue to begin." />
          )}
        </Card>

        <Card title="Queue" description="Sorted by tier, then by submission time." className="xl:col-span-2">
          {queueLoading ? (
            <StateMessage kind="loading" title="Loading the queue" />
          ) : waiting.length === 0 ? (
            <StateMessage
              kind="empty"
              title="The queue is empty"
              description="When a viewer types !review followed by their Roblox username in chat, they will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="pb-3 pr-4 font-medium">#</th>
                    <th className="pb-3 pr-4 font-medium">TikTok</th>
                    <th className="pb-3 pr-4 font-medium">Roblox</th>
                    <th className="pb-3 pr-4 font-medium">Tier</th>
                    <th className="pb-3 pr-4 font-medium">Waiting</th>
                    <th className="pb-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {waiting.map((entry, index) => (
                    <tr key={entry.id} className="transition hover:bg-raised/40 animate-fade-in-up">
                      <td className="py-3 pr-4 font-mono text-slate-400">{index + 1}</td>
                      <td className="py-3 pr-4 text-slate-200">@{entry.tiktok_username}</td>
                      <td className="py-3 pr-4 font-medium text-white">{entry.roblox_username}</td>
                      <td className="py-3 pr-4"><Badge tone={TIER_TONE[entry.tier]}>{TIER_LABEL[entry.tier]}</Badge></td>
                      <td className="py-3 pr-4 text-slate-400">
                        <span title="Estimated wait before this viewer">
                          ~{formatDuration(estimateWaitSeconds(index, DEFAULT_REVIEW_SECONDS))}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="primary"
                            className="px-2.5 py-1.5"
                            icon={<Play className="h-3.5 w-3.5" />}
                            disabled={busyId === entry.id || inReview !== null}
                            onClick={() => runAction(entry, 'start')}
                          >
                            Start
                          </Button>
                          <Button
                            variant="ghost"
                            className="px-2.5 py-1.5"
                            disabled={busyId === entry.id}
                            onClick={() => runAction(entry, 'cancel')}
                          >
                            Cancel
                          </Button>
                          <Button
                            variant="danger"
                            className="px-2.5 py-1.5"
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                            disabled={busyId === entry.id}
                            onClick={() => runAction(entry, 'remove')}
                          >
                            Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
