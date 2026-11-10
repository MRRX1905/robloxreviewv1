import { supabase } from '@/lib/supabase';
import { escapeLikePattern } from '@/lib/search';
import type { ReviewQueueEntry, RobloxInventoryItem, RobloxLookupResult, RobloxProfile } from '@/types/live';

export interface OverlayState {
  current: ReviewQueueEntry | null;
  upNext: ReviewQueueEntry[];
  lookup: RobloxLookupResult | null;
}

const PROFILE_COLUMNS =
  'roblox_user_id, username, display_name, account_created_at, friends_count, followers_count, following_count, avatar_url, lookup_status, status_detail, inventory_status, estimated_catalog_value, priced_item_count, fetched_at';

export async function loadOverlayState(): Promise<OverlayState> {
  const { data: queueRows, error: queueError } = await supabase
    .from('review_queue')
    .select('id, user_id, tiktok_username, roblox_username, tier, status, submitted_at, started_at, completed_at')
    .in('status', ['waiting', 'in_review'])
    .order('submitted_at', { ascending: true })
    .limit(50);
  if (queueError) throw new Error('The overlay could not read the review queue.');

  const entries = (queueRows ?? []) as ReviewQueueEntry[];
  const current = entries.find((entry) => entry.status === 'in_review') ?? null;
  const upNext = entries.filter((entry) => entry.status === 'waiting').slice(0, 3);
  if (!current) return { current, upNext, lookup: null };

  const { data: profileRow, error: profileError } = await supabase
    .from('roblox_profiles')
    .select(PROFILE_COLUMNS)
    .ilike('username', escapeLikePattern(current.roblox_username))
    .order('fetched_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (profileError) throw new Error('The account data for the overlay could not be read.');
  if (!profileRow) return { current, upNext, lookup: null };

  const profile = profileRow as Omit<RobloxProfile, 'roblox_user_id'> & { roblox_user_id: number };
  const { data: inventoryRows, error: inventoryError } = await supabase
    .from('roblox_inventory')
    .select('roblox_user_id, asset_id, name, asset_type, is_equipped, is_limited, catalog_price')
    .eq('roblox_user_id', profile.roblox_user_id);
  if (inventoryError) throw new Error('The item data for the overlay could not be read.');

  return {
    current,
    upNext,
    lookup: { profile: profile as RobloxProfile, inventory: (inventoryRows ?? []) as RobloxInventoryItem[], cached: true },
  };
}
