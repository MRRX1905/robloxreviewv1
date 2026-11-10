import { findGiftRule, resolveGiftTier } from '@/lib/gift-rules';
import { higherTier } from '@/lib/review-queue';
import { createQueueEntry, findActiveEntryForUser, raiseQueueTier } from '@/services/data/review-queue';
import { storeLiveEvent } from '@/services/data/live-events';
import { claimPendingGifts, getPendingPriorityTier, insertGiftTransaction, upsertViewer } from '@/services/data/viewers-and-gifts';
import type { NormalizedLiveEvent } from '@/services/tikfinity/event-normalizer';
import type { GiftRule, LiveEventRecord, QueueTier } from '@/types/live';

const REVIEW_COMMAND = /(?:^|\s)!review\s+@?([A-Za-z0-9_]{3,20})(?![A-Za-z0-9_])/i;

export function parseReviewCommand(message: string | null): string | null {
  if (!message) return null;
  const match = REVIEW_COMMAND.exec(message);
  return match ? match[1] : null;
}

export interface EventProcessingDeps {
  getGiftRules: () => GiftRule[];
  onQueueChanged: () => void;
}

export type ProcessingResult =
  | { status: 'duplicate' }
  | { status: 'stored'; event: LiveEventRecord; note: string | null };

async function handleReviewCommand(
  userId: string,
  tiktokUsername: string,
  robloxUsername: string,
  sourceEventId: string,
  deps: EventProcessingDeps,
): Promise<string | null> {
  const active = await findActiveEntryForUser(userId);
  if (active) return `@${tiktokUsername} is already in the queue.`;

  const pendingTier = await getPendingPriorityTier(userId);
  const entry = await createQueueEntry({
    userId,
    tiktokUsername,
    robloxUsername,
    tier: pendingTier,
    sourceEventId,
  });
  await claimPendingGifts(userId, entry.id);
  deps.onQueueChanged();
  return `@${tiktokUsername} joined the queue as ${entry.roblox_username}.`;
}

async function handleGift(
  event: NormalizedLiveEvent,
  stored: LiveEventRecord,
  userId: string,
  deps: EventProcessingDeps,
): Promise<string | null> {
  if (!event.giftName || event.unitCoinValue === null) {
    return 'Gift value was not reported by TikFinity, so no priority was applied.';
  }

  const totalCoins = event.unitCoinValue * event.giftQuantity;
  const rule = findGiftRule(deps.getGiftRules(), event.giftName);
  const awardedTier: QueueTier = resolveGiftTier(rule, totalCoins) ?? 'normal';

  const active = await findActiveEntryForUser(userId);
  await insertGiftTransaction({
    liveEventId: stored.id,
    userId,
    tiktokUsername: event.tiktokUsername,
    giftName: event.giftName,
    quantity: event.giftQuantity,
    unitCoinValue: event.unitCoinValue,
    totalCoins,
    awardedTier,
    reviewQueueId: active?.id ?? null,
  });

  if (active && awardedTier !== 'normal') {
    const newTier = higherTier(active.tier, awardedTier);
    if (newTier !== active.tier) {
      await raiseQueueTier(active.id, newTier);
      deps.onQueueChanged();
      return `Gift raised @${event.tiktokUsername} to ${newTier}.`;
    }
  }
  return awardedTier === 'normal'
    ? `Gift recorded for @${event.tiktokUsername}; no priority rule matched.`
    : `Gift earned priority for @${event.tiktokUsername}; it applies to their next review.`;
}

/**
 * Stores one validated live event and applies its effects. Each event is written
 * once because the event key is unique, so reconnects never double count.
 */
export async function processLiveEvent(
  event: NormalizedLiveEvent,
  deps: EventProcessingDeps,
): Promise<ProcessingResult> {
  const userId = await upsertViewer(event.tiktokUsername);
  const coinValue = event.eventType === 'gift' && event.unitCoinValue !== null
    ? event.unitCoinValue * event.giftQuantity
    : 0;

  const stored = await storeLiveEvent({
    eventKey: event.eventKey,
    eventType: event.eventType,
    tiktokUsername: event.tiktokUsername,
    message: event.message,
    giftName: event.giftName,
    giftQuantity: event.giftQuantity,
    coinValue,
    occurredAt: event.occurredAt,
    userId,
    raw: null,
  });
  if (!stored) return { status: 'duplicate' };

  let note: string | null = null;
  if (event.eventType === 'chat') {
    const robloxUsername = parseReviewCommand(event.message);
    if (robloxUsername) {
      note = await handleReviewCommand(userId, event.tiktokUsername, robloxUsername, stored.id, deps);
    }
  } else if (event.eventType === 'gift') {
    note = await handleGift(event, stored, userId, deps);
  }

  return { status: 'stored', event: stored, note };
}
