import { supabase } from '@/lib/supabase';
import type { QueueTier } from '@/types/live';
import { TIER_RANK } from '@/lib/review-queue';

export async function upsertViewer(tiktokUsername: string): Promise<string> {
  const { data, error } = await supabase
    .from('users')
    .upsert({ tiktok_username: tiktokUsername }, { onConflict: 'tiktok_username' })
    .select('id')
    .single();
  if (error || !data) throw new Error('The viewer could not be saved.');
  return data.id as string;
}

export interface GiftTransactionInsert {
  liveEventId: string;
  userId: string;
  tiktokUsername: string;
  giftName: string;
  quantity: number;
  unitCoinValue: number;
  totalCoins: number;
  awardedTier: QueueTier;
  reviewQueueId: string | null;
}

export async function insertGiftTransaction(input: GiftTransactionInsert): Promise<void> {
  const { error } = await supabase.from('gift_transactions').insert({
    live_event_id: input.liveEventId,
    user_id: input.userId,
    tiktok_username: input.tiktokUsername,
    gift_name: input.giftName,
    quantity: input.quantity,
    unit_coin_value: input.unitCoinValue,
    total_coins: input.totalCoins,
    awarded_tier: input.awardedTier,
    review_queue_id: input.reviewQueueId,
  });
  if (error) throw new Error('The gift could not be recorded.');
}

/** Highest priority earned by this viewer's gifts that no review has used yet. */
export async function getPendingPriorityTier(userId: string): Promise<QueueTier> {
  const { data, error } = await supabase
    .from('gift_transactions')
    .select('awarded_tier')
    .eq('user_id', userId)
    .is('review_queue_id', null)
    .limit(100);
  if (error) throw new Error('Pending gift priority could not be checked.');

  return ((data ?? []) as { awarded_tier: QueueTier }[]).reduce<QueueTier>(
    (best, row) => (TIER_RANK[row.awarded_tier] > TIER_RANK[best] ? row.awarded_tier : best),
    'normal',
  );
}

export async function claimPendingGifts(userId: string, reviewQueueId: string): Promise<void> {
  const { error } = await supabase
    .from('gift_transactions')
    .update({ review_queue_id: reviewQueueId })
    .eq('user_id', userId)
    .is('review_queue_id', null);
  if (error) throw new Error('Gift priority could not be applied to the review.');
}
