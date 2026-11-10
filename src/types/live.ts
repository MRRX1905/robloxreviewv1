export type QueueTier = 'normal' | 'fast_track' | 'vip_express';

export type ReviewStatus = 'waiting' | 'in_review' | 'completed' | 'cancelled' | 'removed';

export type LiveEventType = 'chat' | 'gift' | 'follow' | 'like' | 'share' | 'subscribe' | 'unknown';

export interface LiveEventRecord {
  id: string;
  event_key: string;
  event_type: LiveEventType;
  tiktok_username: string;
  message: string | null;
  gift_name: string | null;
  gift_quantity: number;
  coin_value: number;
  occurred_at: string;
  created_at: string;
}

export interface GiftRule {
  id: string;
  gift_name: string;
  coin_value: number;
  tier: QueueTier;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReviewQueueEntry {
  id: string;
  user_id: string | null;
  tiktok_username: string;
  roblox_username: string;
  tier: QueueTier;
  status: ReviewStatus;
  submitted_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface ReviewHistoryRecord {
  id: string;
  queue_id: string | null;
  tiktok_username: string;
  roblox_username: string;
  tier: QueueTier;
  status: 'completed' | 'cancelled' | 'removed';
  estimated_catalog_value: number | null;
  review_started_at: string | null;
  review_ended_at: string;
  duration_seconds: number | null;
  created_at: string;
}

export type LookupStatus = 'ok' | 'partial' | 'unavailable';

export type InventoryStatus = 'ok' | 'private' | 'unavailable';

export type RobloxPresenceStatus = 'offline' | 'online' | 'in_game' | 'in_studio' | 'unknown';

export type RobloxItemAvailability = 'limited' | 'paid' | 'off_sale' | 'free' | 'unknown';

export type RobloxItemRarity = 'Limited' | 'Legendary' | 'Epic' | 'Rare' | 'Common';

export type RobloxPriceStatus = 'ok' | 'partial' | 'unavailable';

export interface RobloxGroupSummary {
  id: number;
  name: string;
  role: string;
  member_count: number;
  verified: boolean;
}

export interface RobloxProfile {
  roblox_user_id: number;
  username: string;
  display_name: string | null;
  account_created_at: string | null;
  friends_count: number | null;
  followers_count: number | null;
  following_count: number | null;
  avatar_url: string | null;
  lookup_status: LookupStatus | 'private' | 'not_found';
  status_detail: string | null;
  inventory_status: InventoryStatus;
  estimated_catalog_value: number | null;
  priced_item_count: number;
  fetched_at: string;
  // Extra public detail. Optional because older cached rows do not have it.
  description?: string | null;
  has_verified_badge?: boolean;
  is_banned?: boolean;
  avatar_render_url?: string | null;
  avatar_type?: string | null;
  presence_status?: RobloxPresenceStatus | null;
  presence_detail?: string | null;
  last_online_at?: string | null;
  groups_count?: number | null;
  top_groups?: RobloxGroupSummary[] | null;
  outfit_value?: number | null;
  limited_item_count?: number;
  limited_value?: number | null;
  price_status?: RobloxPriceStatus | null;
  inventory_value?: number | null;
  inventory_item_count?: number;
}

export interface RobloxInventoryItem {
  roblox_user_id: number;
  asset_id: number;
  name: string;
  asset_type: string | null;
  is_equipped: boolean;
  is_limited: boolean;
  catalog_price: number | null;
  availability?: RobloxItemAvailability | null;
  rarity?: RobloxItemRarity | null;
  resale_price?: number | null;
  original_price?: number | null;
  thumbnail_url?: string | null;
  creator_name?: string | null;
}

export interface RobloxLookupResult {
  profile: RobloxProfile;
  inventory: RobloxInventoryItem[];
  cached: boolean;
}

export interface NarrationSettings {
  voice: string;
  rate: number;
  pitch: number;
  style: NarrationStyle;
}

export type NarrationStyle = 'funny' | 'savage_friendly' | 'professional' | 'gaming_commentator' | 'dramatic';

export interface ConnectionSettings {
  host: string;
  port: number;
}
