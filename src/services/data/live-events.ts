import { supabase } from '@/lib/supabase';
import type { LiveEventRecord } from '@/types/live';

export interface LiveEventInsert {
  eventKey: string;
  eventType: LiveEventRecord['event_type'];
  tiktokUsername: string;
  message: string | null;
  giftName: string | null;
  giftQuantity: number;
  coinValue: number;
  occurredAt: string;
  userId: string;
  raw: unknown;
}

export async function storeLiveEvent(input: LiveEventInsert): Promise<LiveEventRecord | null> {
  const { data, error } = await supabase
    .from('live_events')
    .upsert(
      {
        event_key: input.eventKey,
        event_type: input.eventType,
        user_id: input.userId,
        tiktok_username: input.tiktokUsername,
        message: input.message,
        gift_name: input.giftName,
        gift_quantity: input.giftQuantity,
        coin_value: input.coinValue,
        occurred_at: input.occurredAt,
        raw: input.raw,
      },
      { onConflict: 'event_key', ignoreDuplicates: true },
    )
    .select()
    .maybeSingle();
  if (error) throw new Error('A live event could not be saved.');
  return (data as LiveEventRecord | null) ?? null;
}

export async function listRecentLiveEvents(limit: number): Promise<LiveEventRecord[]> {
  const { data, error } = await supabase
    .from('live_events')
    .select('id, event_key, event_type, tiktok_username, message, gift_name, gift_quantity, coin_value, occurred_at, created_at')
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error('Recent live events could not be loaded.');
  return (data ?? []) as LiveEventRecord[];
}

export async function listLiveEventsSince(sinceIso: string, limit: number): Promise<Pick<LiveEventRecord, 'event_type' | 'occurred_at'>[]> {
  const { data, error } = await supabase
    .from('live_events')
    .select('event_type, occurred_at')
    .gte('occurred_at', sinceIso)
    .order('occurred_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error('Event activity could not be loaded.');
  return (data ?? []) as Pick<LiveEventRecord, 'event_type' | 'occurred_at'>[];
}
