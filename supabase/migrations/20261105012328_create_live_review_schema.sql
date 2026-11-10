/*
# Create Roblox Live Stream Center schema

Plain-English summary:
This migration creates every table the live review center needs: viewers, live events, gift rules, validated gift transactions, the review queue, review history, cached Roblox profiles and inventory, and app settings.

1. New Tables
- `users`: one row per TikTok viewer who has interacted with the stream.
- `live_events`: every normalized TikTok LIVE event (chat, gift, follow, like, share, subscribe). `event_key` is unique so the same event is never stored twice.
- `gift_rules`: admin-configured gift names, coin thresholds, queue tier, and enabled flag.
- `gift_transactions`: only real gift events that were validated and matched to a rule. One row per live event.
- `review_queue`: waiting, in-review, completed, cancelled, and removed review entries with queue tier.
- `review_history`: finished review records with duration and estimated catalog value.
- `roblox_profiles`: cached public Roblox profile data and the estimated catalog value.
- `roblox_inventory`: cached public inventory items and their catalog prices.
- `application_settings`: key/value settings (TikFinity connection, review defaults).

2. Security
- Row level security is enabled on every table.
- Single-tenant, no sign-in: the app reads and writes as the anon role, so policies are granted to `anon` and `authenticated`.
- Roblox cache tables are read-only for the browser. Only the server-side Roblox lookup function (service role) writes them.

3. Realtime
- `review_queue` is added to the realtime publication so the OBS overlay updates instantly.

Important notes
1. Every statement is idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS), so the migration is safe to re-run.
2. No existing data is modified or removed.
*/

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tiktok_username text NOT NULL UNIQUE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS live_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  event_type text NOT NULL CHECK (event_type IN ('chat', 'gift', 'follow', 'like', 'share', 'subscribe', 'unknown')),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  tiktok_username text NOT NULL,
  message text,
  gift_name text,
  gift_quantity integer NOT NULL DEFAULT 1 CHECK (gift_quantity >= 0),
  coin_value integer NOT NULL DEFAULT 0 CHECK (coin_value >= 0),
  raw jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS live_events_occurred_at_idx ON live_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS live_events_type_idx ON live_events (event_type);

CREATE TABLE IF NOT EXISTS gift_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_name text NOT NULL UNIQUE,
  coin_value integer NOT NULL CHECK (coin_value >= 0),
  tier text NOT NULL CHECK (tier IN ('normal', 'fast_track', 'vip_express')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gift_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  live_event_id uuid NOT NULL UNIQUE REFERENCES live_events(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  tiktok_username text NOT NULL,
  gift_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_coin_value integer NOT NULL CHECK (unit_coin_value >= 0),
  total_coins integer NOT NULL CHECK (total_coins >= 0),
  awarded_tier text NOT NULL CHECK (awarded_tier IN ('normal', 'fast_track', 'vip_express')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  tiktok_username text NOT NULL,
  roblox_username text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('normal', 'fast_track', 'vip_express')),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_review', 'completed', 'cancelled', 'removed')),
  source_event_id uuid REFERENCES live_events(id) ON DELETE SET NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_queue_status_idx ON review_queue (status, submitted_at);

CREATE TABLE IF NOT EXISTS review_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid UNIQUE REFERENCES review_queue(id) ON DELETE SET NULL,
  tiktok_username text NOT NULL,
  roblox_username text NOT NULL,
  tier text NOT NULL CHECK (tier IN ('normal', 'fast_track', 'vip_express')),
  status text NOT NULL CHECK (status IN ('completed', 'cancelled', 'removed')),
  estimated_catalog_value integer CHECK (estimated_catalog_value IS NULL OR estimated_catalog_value >= 0),
  review_started_at timestamptz,
  review_ended_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds integer CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS review_history_ended_idx ON review_history (review_ended_at DESC);

CREATE TABLE IF NOT EXISTS roblox_profiles (
  roblox_user_id bigint PRIMARY KEY,
  username text NOT NULL,
  display_name text,
  account_created_at timestamptz,
  friends_count integer,
  followers_count integer,
  following_count integer,
  avatar_url text,
  lookup_status text NOT NULL CHECK (lookup_status IN ('ok', 'partial', 'private', 'not_found', 'unavailable')),
  status_detail text,
  inventory_status text NOT NULL DEFAULT 'unavailable' CHECK (inventory_status IN ('ok', 'private', 'unavailable')),
  estimated_catalog_value bigint,
  priced_item_count integer NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roblox_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roblox_user_id bigint NOT NULL REFERENCES roblox_profiles(roblox_user_id) ON DELETE CASCADE,
  asset_id bigint NOT NULL,
  name text NOT NULL,
  asset_type text,
  is_equipped boolean NOT NULL DEFAULT false,
  is_limited boolean NOT NULL DEFAULT false,
  catalog_price integer,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (roblox_user_id, asset_id)
);

CREATE TABLE IF NOT EXISTS application_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE live_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE gift_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE roblox_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roblox_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_settings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON users, live_events, gift_rules, gift_transactions, review_queue, review_history, application_settings TO anon, authenticated;
GRANT SELECT ON roblox_profiles, roblox_inventory TO anon, authenticated;
GRANT ALL ON roblox_profiles, roblox_inventory TO service_role;

DROP POLICY IF EXISTS "anon_select_users" ON users;
CREATE POLICY "anon_select_users" ON users FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_users" ON users;
CREATE POLICY "anon_insert_users" ON users FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_users" ON users;
CREATE POLICY "anon_update_users" ON users FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_users" ON users;
CREATE POLICY "anon_delete_users" ON users FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_live_events" ON live_events;
CREATE POLICY "anon_select_live_events" ON live_events FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_live_events" ON live_events;
CREATE POLICY "anon_insert_live_events" ON live_events FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_live_events" ON live_events;
CREATE POLICY "anon_update_live_events" ON live_events FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_live_events" ON live_events;
CREATE POLICY "anon_delete_live_events" ON live_events FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_gift_rules" ON gift_rules;
CREATE POLICY "anon_select_gift_rules" ON gift_rules FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_gift_rules" ON gift_rules;
CREATE POLICY "anon_insert_gift_rules" ON gift_rules FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_gift_rules" ON gift_rules;
CREATE POLICY "anon_update_gift_rules" ON gift_rules FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_gift_rules" ON gift_rules;
CREATE POLICY "anon_delete_gift_rules" ON gift_rules FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_gift_transactions" ON gift_transactions;
CREATE POLICY "anon_select_gift_transactions" ON gift_transactions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_gift_transactions" ON gift_transactions;
CREATE POLICY "anon_insert_gift_transactions" ON gift_transactions FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_gift_transactions" ON gift_transactions;
CREATE POLICY "anon_update_gift_transactions" ON gift_transactions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_gift_transactions" ON gift_transactions;
CREATE POLICY "anon_delete_gift_transactions" ON gift_transactions FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_review_queue" ON review_queue;
CREATE POLICY "anon_select_review_queue" ON review_queue FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_review_queue" ON review_queue;
CREATE POLICY "anon_insert_review_queue" ON review_queue FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_review_queue" ON review_queue;
CREATE POLICY "anon_update_review_queue" ON review_queue FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_review_queue" ON review_queue;
CREATE POLICY "anon_delete_review_queue" ON review_queue FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_review_history" ON review_history;
CREATE POLICY "anon_select_review_history" ON review_history FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_review_history" ON review_history;
CREATE POLICY "anon_insert_review_history" ON review_history FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_review_history" ON review_history;
CREATE POLICY "anon_update_review_history" ON review_history FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_review_history" ON review_history;
CREATE POLICY "anon_delete_review_history" ON review_history FOR DELETE TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_roblox_profiles" ON roblox_profiles;
CREATE POLICY "anon_select_roblox_profiles" ON roblox_profiles FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_select_roblox_inventory" ON roblox_inventory;
CREATE POLICY "anon_select_roblox_inventory" ON roblox_inventory FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_select_application_settings" ON application_settings;
CREATE POLICY "anon_select_application_settings" ON application_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_application_settings" ON application_settings;
CREATE POLICY "anon_insert_application_settings" ON application_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_application_settings" ON application_settings;
CREATE POLICY "anon_update_application_settings" ON application_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_application_settings" ON application_settings;
CREATE POLICY "anon_delete_application_settings" ON application_settings FOR DELETE TO anon, authenticated USING (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'review_queue'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE review_queue;
  END IF;
END $$;
