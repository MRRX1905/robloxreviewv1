/*
# Store the total value of the whole owned inventory

Plain-English summary:
The Account Analyzer now reads every owned item for public inventories, not only
the equipped outfit and limited items. This migration stores the total value of
those items and how many the account owns.

1. roblox_profiles gains:
- inventory_value: sum of the catalog or resale price of every owned item that
  has a public price, including off-sale limited items.
- inventory_item_count: how many owned items were read.

Important notes
1. Every statement is idempotent, so the migration is safe to re-run.
2. The lookup function keeps working before this migration is applied: it
   detects the missing columns, returns the totals on fresh lookups, and skips
   caching the extra detail until the columns exist.
3. Values are estimates from the public catalog, not what the owner spent.
*/

ALTER TABLE roblox_profiles
  ADD COLUMN IF NOT EXISTS inventory_value bigint,
  ADD COLUMN IF NOT EXISTS inventory_item_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN roblox_profiles.inventory_value IS
  'Sum of the public catalog or lowest resale price of every owned item. Includes off-sale limited items. Not spending or market value.';
COMMENT ON COLUMN roblox_profiles.inventory_item_count IS
  'Number of owned items read from the public inventory. Zero when the inventory is private.';

NOTIFY pgrst, 'reload schema';
