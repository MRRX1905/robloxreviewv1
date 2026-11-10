/*
# Add public account detail and item pricing fields to the Roblox cache

Plain-English summary:
The Account Analyzer now reads more public Roblox data and values limited items at
their resale price. This migration adds the columns needed to cache that detail.

1. roblox_profiles gains:
- bio/description, verified badge, banned flag
- full-body avatar render and avatar type (R15/R6)
- presence status, presence detail and last online time
- group count and the largest groups the account belongs to
- equipped outfit value, limited item count and limited item value

2. roblox_inventory gains per-item availability, rarity tier, resale price,
   original price, thumbnail URL and creator name.

3. Security is unchanged: the browser may only read the cache tables, and the
   Roblox lookup function (service role) writes them.

Important notes
1. Every statement is idempotent, so the migration is safe to re-run.
2. Existing cached rows keep working: new counters default to 0 and other new
   columns stay NULL until the next lookup refreshes them.
3. The lookup function still works before this migration is applied; it then
   returns the extra detail only on fresh lookups and skips caching them.
*/

ALTER TABLE roblox_profiles
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS has_verified_badge boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS avatar_render_url text,
  ADD COLUMN IF NOT EXISTS avatar_type text,
  ADD COLUMN IF NOT EXISTS presence_status text,
  ADD COLUMN IF NOT EXISTS presence_detail text,
  ADD COLUMN IF NOT EXISTS last_online_at timestamptz,
  ADD COLUMN IF NOT EXISTS groups_count integer,
  ADD COLUMN IF NOT EXISTS top_groups jsonb,
  ADD COLUMN IF NOT EXISTS outfit_value bigint,
  ADD COLUMN IF NOT EXISTS limited_item_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS limited_value bigint,
  ADD COLUMN IF NOT EXISTS price_status text;

ALTER TABLE roblox_inventory
  ADD COLUMN IF NOT EXISTS availability text,
  ADD COLUMN IF NOT EXISTS rarity text,
  ADD COLUMN IF NOT EXISTS resale_price bigint,
  ADD COLUMN IF NOT EXISTS original_price bigint,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS creator_name text;

/*
  Rare limited items can be worth more than 2,147,483,647 Robux (1-of-1 items
  reach 100 billion), which does not fit the original integer columns.
*/
ALTER TABLE roblox_inventory
  ALTER COLUMN catalog_price TYPE bigint;

ALTER TABLE review_history
  ALTER COLUMN estimated_catalog_value TYPE bigint;

/*
  Roblox allows only 10 catalog price requests per minute per IP, so prices are
  shared between lookups for six hours. The edge function tolerates this table
  being absent and simply calls Roblox directly.
*/
CREATE TABLE IF NOT EXISTS roblox_asset_prices (
  asset_id bigint PRIMARY KEY,
  name text,
  asset_type_id integer,
  price bigint,
  lowest_price bigint,
  lowest_resale_price bigint,
  is_limited boolean NOT NULL DEFAULT false,
  is_off_sale boolean NOT NULL DEFAULT false,
  price_status text,
  has_resellers boolean NOT NULL DEFAULT false,
  item_restrictions jsonb NOT NULL DEFAULT '[]'::jsonb,
  creator_name text,
  favorite_count integer,
  total_quantity bigint,
  checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS roblox_asset_prices_checked_at_idx ON roblox_asset_prices (checked_at DESC);

ALTER TABLE roblox_asset_prices ENABLE ROW LEVEL SECURITY;
GRANT ALL ON roblox_asset_prices TO service_role;

COMMENT ON TABLE roblox_asset_prices IS
  'Short-lived cache of public Roblox catalog prices, shared by all account lookups to stay under the catalog rate limit.';

COMMENT ON COLUMN roblox_profiles.estimated_catalog_value IS
  'Sum of public catalog prices and limited resale prices for the equipped outfit and public limited items. Not spending or market value.';
COMMENT ON COLUMN roblox_inventory.catalog_price IS
  'Resolved public price: lowest resale price for limited items, catalog price for items on sale, 0 for free items, NULL when unknown.';

NOTIFY pgrst, 'reload schema';
