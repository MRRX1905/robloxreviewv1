import { supabase } from '@/lib/supabase';
import { escapeLikePattern } from '@/lib/search';
import type { QueueTier, ReviewHistoryRecord, ReviewQueueEntry, ReviewStatus } from '@/types/live';
import { DEFAULT_REVIEW_SECONDS } from '@/lib/review-queue';

const ACTIVE_STATUSES: ReviewStatus[] = ['waiting', 'in_review'];

const QUEUE_COLUMNS =
  'id, user_id, tiktok_username, roblox_username, tier, status, submitted_at, started_at, completed_at';

export async function listActiveQueue(): Promise<ReviewQueueEntry[]> {
  const { data, error } = await supabase
    .from('review_queue')
    .select(QUEUE_COLUMNS)
    .in('status', ACTIVE_STATUSES)
    .order('submitted_at', { ascending: true })
    .limit(500);
  if (error) throw new Error('The review queue could not be loaded.');
  return (data ?? []) as ReviewQueueEntry[];
}

export async function findActiveEntryForUser(userId: string): Promise<ReviewQueueEntry | null> {
  const { data, error } = await supabase
    .from('review_queue')
    .select(QUEUE_COLUMNS)
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES)
    .order('submitted_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('The viewer’s queue position could not be checked.');
  return (data as ReviewQueueEntry | null) ?? null;
}

export interface NewQueueEntry {
  userId: string;
  tiktokUsername: string;
  robloxUsername: string;
  tier: QueueTier;
  sourceEventId: string | null;
}

export async function createQueueEntry(input: NewQueueEntry): Promise<ReviewQueueEntry> {
  const { data, error } = await supabase
    .from('review_queue')
    .insert({
      user_id: input.userId,
      tiktok_username: input.tiktokUsername,
      roblox_username: input.robloxUsername,
      tier: input.tier,
      source_event_id: input.sourceEventId,
    })
    .select(QUEUE_COLUMNS)
    .single();
  if (error || !data) throw new Error('The viewer could not be added to the queue.');
  return data as ReviewQueueEntry;
}

export async function raiseQueueTier(id: string, tier: QueueTier): Promise<void> {
  const { error } = await supabase
    .from('review_queue')
    .update({ tier, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error('The queue priority could not be updated.');
}

export async function startReview(entry: ReviewQueueEntry): Promise<void> {
  const { data: current, error: currentError } = await supabase
    .from('review_queue')
    .select('id')
    .eq('status', 'in_review')
    .neq('id', entry.id)
    .limit(1)
    .maybeSingle();
  if (currentError) throw new Error('The current review could not be checked.');
  if (current) throw new Error('Finish the current review before starting another one.');

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('review_queue')
    .update({ status: 'in_review', started_at: now, updated_at: now })
    .eq('id', entry.id)
    .eq('status', 'waiting');
  if (error) throw new Error('The review could not be started.');
}

async function recordHistory(
  entry: ReviewQueueEntry,
  status: ReviewHistoryRecord['status'],
  estimatedCatalogValue: number | null,
): Promise<void> {
  const endedAt = new Date();
  const startedAt = entry.started_at ? new Date(entry.started_at) : null;
  const durationSeconds = startedAt ? Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000)) : null;

  const row = {
    queue_id: entry.id,
    tiktok_username: entry.tiktok_username,
    roblox_username: entry.roblox_username,
    tier: entry.tier,
    status,
    estimated_catalog_value: estimatedCatalogValue,
    review_started_at: entry.started_at,
    review_ended_at: endedAt.toISOString(),
    duration_seconds: durationSeconds,
  };

  let { error } = await supabase.from('review_history').insert(row);
  // Price columns are widened to bigint by the newest migration. Until it is
  // applied, cap ultra-rare values so finishing a review never fails.
  if (error && (error.code === '22003' || /out of range/i.test(error.message))) {
    const capped = estimatedCatalogValue === null ? null : Math.min(estimatedCatalogValue, 2_147_483_647);
    ({ error } = await supabase.from('review_history').insert({ ...row, estimated_catalog_value: capped }));
  }
  if (error) throw new Error('The review could not be saved to history.');
}

async function closeEntry(
  entry: ReviewQueueEntry,
  status: 'completed' | 'cancelled' | 'removed',
  estimatedCatalogValue: number | null,
): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('review_queue')
    .update({ status, completed_at: now, updated_at: now })
    .eq('id', entry.id)
    .in('status', ACTIVE_STATUSES)
    .select('id')
    .maybeSingle();
  if (error) throw new Error('The queue entry could not be updated.');
  if (!data) throw new Error('This entry was already closed.');
  await recordHistory(entry, status, estimatedCatalogValue);
}

export async function completeReview(entry: ReviewQueueEntry): Promise<void> {
  const { data, error } = await supabase
    .from('roblox_profiles')
    .select('estimated_catalog_value')
    .ilike('username', escapeLikePattern(entry.roblox_username))
    .limit(1)
    .maybeSingle();
  if (error) throw new Error('The catalog value could not be read for history.');
  await closeEntry(entry, 'completed', (data?.estimated_catalog_value as number | null | undefined) ?? null);
}

export function cancelReview(entry: ReviewQueueEntry): Promise<void> {
  return closeEntry(entry, 'cancelled', null);
}

export function removeFromQueue(entry: ReviewQueueEntry): Promise<void> {
  return closeEntry(entry, 'removed', null);
}

export { DEFAULT_REVIEW_SECONDS };
