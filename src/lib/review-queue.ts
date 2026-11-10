import type { QueueTier, ReviewQueueEntry } from '@/types/live';

export const TIER_RANK: Record<QueueTier, number> = {
  normal: 1,
  fast_track: 2,
  vip_express: 3,
};

export const TIER_LABEL: Record<QueueTier, string> = {
  normal: 'Normal',
  fast_track: 'Fast Track',
  vip_express: 'VIP Express',
};

export const DEFAULT_REVIEW_SECONDS = 300;

export function higherTier(a: QueueTier, b: QueueTier): QueueTier {
  return TIER_RANK[a] >= TIER_RANK[b] ? a : b;
}

export function sortWaitingQueue(entries: ReviewQueueEntry[]): ReviewQueueEntry[] {
  return entries
    .filter((entry) => entry.status === 'waiting')
    .sort((a, b) => {
      const tierDiff = TIER_RANK[b.tier] - TIER_RANK[a.tier];
      if (tierDiff !== 0) return tierDiff;
      return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
    });
}

export function estimateWaitSeconds(position: number, averageReviewSeconds: number): number {
  return Math.max(0, position) * averageReviewSeconds;
}
