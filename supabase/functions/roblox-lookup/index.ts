import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import {
  assetTypeLabel,
  fetchAssetThumbnails,
  fetchAvatar,
  fetchAvatarFullBodyUrl,
  fetchAvatarHeadshotUrl,
  fetchCatalogDetails,
  fetchCollectibles,
  fetchCount,
  fetchGroups,
  fetchInventory,
  fetchPresence,
  fetchUserDetails,
  probeInventoryStatus,
  resolveUsername,
  RobloxApiError,
  type RobloxAssetDetails,
  type RobloxGroup,
  type RobloxInventoryStatus,
} from "./roblox-api.ts";
import {
  buildValuedItem,
  resolvePriceStatus,
  summarizeValuedItems,
  type ItemSeed,
  type ValuedItem,
} from "./roblox-value.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CACHE_TTL_MS = 30 * 60 * 1000;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const MAX_VALUED_ITEMS = 900;
const MAX_TOP_GROUPS = 5;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

class LookupError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

async function settle<T>(label: string, task: Promise<T>, failures: string[]): Promise<T | null> {
  try {
    return await task;
  } catch {
    failures.push(label);
    return null;
  }
}

function toLookupError(error: unknown): LookupError {
  if (error instanceof RobloxApiError && error.status === 429) {
    return new LookupError(503, "Roblox is limiting requests right now. Try again in a minute.");
  }
  return new LookupError(503, "Roblox could not be reached. Check your connection and try again.");
}

function topGroups(groups: RobloxGroup[]) {
  return [...groups]
    .sort((a, b) => b.memberCount - a.memberCount)
    .slice(0, MAX_TOP_GROUPS)
    .map((group) => ({
      id: group.id,
      name: group.name,
      role: group.roleName,
      member_count: group.memberCount,
      verified: group.hasVerifiedBadge,
    }));
}

// Columns from 20261109195500_add_roblox_public_details.sql. The function keeps
// working against a database that has not run that migration yet: it retries
// with the original column set and avoids the cache until the columns exist.
const PROFILE_DETAIL_FIELDS = [
  "description",
  "has_verified_badge",
  "is_banned",
  "avatar_render_url",
  "avatar_type",
  "presence_status",
  "presence_detail",
  "last_online_at",
  "groups_count",
  "top_groups",
  "outfit_value",
  "limited_item_count",
  "limited_value",
  "price_status",
  "inventory_value",
  "inventory_item_count",
] as const;

const INVENTORY_DETAIL_FIELDS = [
  "availability",
  "rarity",
  "resale_price",
  "original_price",
  "thumbnail_url",
  "creator_name",
] as const;

let detailColumnsAvailable: boolean | null = null;

function hasPersistedDetails(profile: Record<string, unknown>): boolean {
  return PROFILE_DETAIL_FIELDS.every((field) => field in profile);
}

function isMissingColumnError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null;
  if (candidate === null) return false;
  return (
    candidate.code === "PGRST204"
    || candidate.code === "42703"
    || /could not find the '.*' column|column .* does not exist/i.test(candidate.message ?? "")
  );
}

const INT4_MAX = 2_147_483_647;

function isOutOfRangeError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null;
  if (candidate === null) return false;
  return candidate.code === "22003" || /out of range/i.test(candidate.message ?? "");
}

function clampLegacyPrices(row: Record<string, unknown>): Record<string, unknown> {
  const clamp = (value: unknown) =>
    typeof value === "number" && value > INT4_MAX ? INT4_MAX : value;
  return {
    ...row,
    catalog_price: clamp(row.catalog_price),
    resale_price: clamp(row.resale_price),
    original_price: clamp(row.original_price),
  };
}

function withoutKeys(row: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const copy = { ...row };
  for (const key of keys) delete copy[key];
  return copy;
}

async function saveLookup(
  profileRow: Record<string, unknown>,
  inventoryRows: Record<string, unknown>[],
): Promise<void> {
  let savedWithDetails = detailColumnsAvailable !== false;

  const writeProfile = async (includeDetails: boolean) => {
    const { error } = await supabase
      .from("roblox_profiles")
      .upsert(includeDetails ? profileRow : withoutKeys(profileRow, PROFILE_DETAIL_FIELDS), {
        onConflict: "roblox_user_id",
      });
    return error;
  };

  if (savedWithDetails) {
    const error = await writeProfile(true);
    if (error !== null) {
      if (!isMissingColumnError(error)) throw error;
      savedWithDetails = false;
      detailColumnsAvailable = false;
    }
  }

  if (!savedWithDetails) {
    const error = await writeProfile(false);
    if (error !== null) throw error;
  } else {
    detailColumnsAvailable = true;
  }

  const { error: clearError } = await supabase
    .from("roblox_inventory")
    .delete()
    .eq("roblox_user_id", profileRow.roblox_user_id);
  if (clearError !== null) throw clearError;

  if (inventoryRows.length === 0) return;

  let rows = inventoryRows;
  let { error: insertError } = await supabase.from("roblox_inventory").insert(rows);
  if (insertError !== null && isMissingColumnError(insertError)) {
    rows = inventoryRows.map((row) => withoutKeys(row, INVENTORY_DETAIL_FIELDS));
    ({ error: insertError } = await supabase.from("roblox_inventory").insert(rows));
  }
  // Until the price columns are widened to bigint, ultra-rare items can exceed
  // the old integer range. Store the capped value instead of failing the lookup.
  if (insertError !== null && isOutOfRangeError(insertError)) {
    rows = rows.map(clampLegacyPrices);
    ({ error: insertError } = await supabase.from("roblox_inventory").insert(rows));
  }
  if (insertError !== null) throw insertError;
}

async function loadCachedLookup(username: string) {
  const { data: profile, error } = await supabase
    .from("roblox_profiles")
    .select("*")
    .ilike("username", escapeLikePattern(username))
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!profile) return null;
  if (Date.now() - new Date(profile.fetched_at).getTime() > CACHE_TTL_MS) return null;
  if (profile.lookup_status !== "ok") return null;
  // Rows written before the detail columns existed cannot serve the analyzer.
  if (!hasPersistedDetails(profile as Record<string, unknown>)) return null;
  // Public inventories cached before full-inventory reads existed have a zero
  // count; refresh them so the totals and the complete item list are accurate.
  if (profile.inventory_status === "ok" && !(Number(profile.inventory_item_count) > 0)) return null;

  const { data: inventory, error: inventoryError } = await supabase
    .from("roblox_inventory")
    .select("*")
    .eq("roblox_user_id", profile.roblox_user_id)
    .order("catalog_price", { ascending: false, nullsFirst: false });
  if (inventoryError) throw inventoryError;

  return { profile, inventory: inventory ?? [] };
}

const PRICE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function rowToAssetDetails(row: Record<string, unknown>): RobloxAssetDetails | null {
  const assetId = asFiniteNumber(row.asset_id);
  if (assetId === null) return null;
  return {
    assetId,
    name: typeof row.name === "string" && row.name.length > 0 ? row.name : `Asset ${assetId}`,
    assetTypeId: asFiniteNumber(row.asset_type_id),
    price: asFiniteNumber(row.price),
    lowestPrice: asFiniteNumber(row.lowest_price),
    lowestResalePrice: asFiniteNumber(row.lowest_resale_price),
    isLimited: row.is_limited === true,
    isOffSale: row.is_off_sale === true,
    priceStatus: typeof row.price_status === "string" ? row.price_status : null,
    hasResellers: row.has_resellers === true,
    itemRestrictions: Array.isArray(row.item_restrictions)
      ? row.item_restrictions.filter((value): value is string => typeof value === "string")
      : [],
    creatorName: typeof row.creator_name === "string" ? row.creator_name : null,
    favoriteCount: asFiniteNumber(row.favorite_count),
    totalQuantity: asFiniteNumber(row.total_quantity),
  };
}

/**
 * Roblox allows only 10 catalog detail requests per minute per IP, and the
 * function shares its egress IP. Prices are cached for six hours so repeat and
 * cross-account lookups do not spend that budget.
 */
async function loadCachedPrices(assetIds: number[]): Promise<Map<number, RobloxAssetDetails>> {
  const prices = new Map<number, RobloxAssetDetails>();
  if (assetIds.length === 0) return prices;
  try {
    const { data, error } = await supabase
      .from("roblox_asset_prices")
      .select("*")
      .in("asset_id", assetIds)
      .gte("checked_at", new Date(Date.now() - PRICE_CACHE_TTL_MS).toISOString());
    if (error !== null) return prices;
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const detail = rowToAssetDetails(row);
      if (detail !== null) prices.set(detail.assetId, detail);
    }
  } catch {
    // The cache is optional; a missing table just means fresh Roblox requests.
  }
  return prices;
}

async function saveCachedPrices(details: RobloxAssetDetails[]): Promise<void> {
  if (details.length === 0) return;
  const checkedAt = new Date().toISOString();
  try {
    await supabase.from("roblox_asset_prices").upsert(
      details.map((detail) => ({
        asset_id: detail.assetId,
        name: detail.name,
        asset_type_id: detail.assetTypeId,
        price: detail.price,
        lowest_price: detail.lowestPrice,
        lowest_resale_price: detail.lowestResalePrice,
        is_limited: detail.isLimited,
        is_off_sale: detail.isOffSale,
        price_status: detail.priceStatus,
        has_resellers: detail.hasResellers,
        item_restrictions: detail.itemRestrictions,
        creator_name: detail.creatorName,
        favorite_count: detail.favoriteCount,
        total_quantity: detail.totalQuantity,
        checked_at: checkedAt,
      })),
      { onConflict: "asset_id" },
    );
  } catch {
    // Same as above: never fail a lookup because the cache could not be written.
  }
}

async function performLookup(username: string) {
  let reference;
  try {
    reference = await resolveUsername(username);
  } catch (error) {
    throw toLookupError(error);
  }
  if (!reference) {
    throw new LookupError(404, `No Roblox account named "${username}" was found.`);
  }
  const userId = reference.id;
  const failures: string[] = [];

  const [details, friends, followers, followings, avatar, presence, groups, collectibles, inventoryStatus] =
    await Promise.all([
      settle("profile details", fetchUserDetails(userId), failures),
      settle("friends", fetchCount(`https://friends.roblox.com/v1/users/${userId}/friends/count`), failures),
      settle("followers", fetchCount(`https://friends.roblox.com/v1/users/${userId}/followers/count`), failures),
      settle("following", fetchCount(`https://friends.roblox.com/v1/users/${userId}/followings/count`), failures),
      settle("equipped outfit", fetchAvatar(userId), failures),
      settle("presence", fetchPresence(userId), failures),
      settle("groups", fetchGroups(userId), failures),
      settle("limited items", fetchCollectibles(userId), failures),
      probeInventoryStatus(userId) as Promise<RobloxInventoryStatus>,
    ]);

  const [headshotUrl, renderUrl] = await Promise.all([
    fetchAvatarHeadshotUrl(userId).catch(() => null),
    fetchAvatarFullBodyUrl(userId).catch(() => null),
  ]);

  // Only public inventories can be read in full. Private ones keep the
  // equipped outfit and the public collectibles list.
  const owned = inventoryStatus === "ok"
    ? await settle("owned items", fetchInventory(userId), failures)
    : null;

  const seeds = new Map<number, ItemSeed>();
  for (const asset of avatar?.assets ?? []) {
    seeds.set(asset.assetId, {
      assetId: asset.assetId,
      name: asset.name,
      assetType: assetTypeLabel(asset.assetTypeId) ?? asset.assetType,
      isEquipped: true,
      collectible: null,
    });
  }
  for (const item of collectibles ?? []) {
    const existing = seeds.get(item.assetId);
    if (existing) {
      existing.collectible = {
        recentAveragePrice: item.recentAveragePrice,
        originalPrice: item.originalPrice,
      };
      continue;
    }
    seeds.set(item.assetId, {
      assetId: item.assetId,
      name: item.name,
      assetType: null,
      isEquipped: false,
      collectible: {
        recentAveragePrice: item.recentAveragePrice,
        originalPrice: item.originalPrice,
      },
    });
  }
  for (const item of owned ?? []) {
    if (seeds.has(item.assetId)) continue;
    seeds.set(item.assetId, {
      assetId: item.assetId,
      name: item.name,
      assetType: assetTypeLabel(item.assetTypeId),
      isEquipped: false,
      collectible: null,
    });
  }

  const valuedIds = [...seeds.keys()].slice(0, MAX_VALUED_ITEMS);
  const [cachedPrices, thumbnails] = await Promise.all([
    loadCachedPrices(valuedIds),
    valuedIds.length > 0 ? fetchAssetThumbnails(valuedIds) : Promise.resolve(new Map<number, string>()),
  ]);

  const missingIds = valuedIds.filter((assetId) => !cachedPrices.has(assetId));
  let fetchedPrices: RobloxAssetDetails[] = [];
  let catalogFailed = false;
  if (missingIds.length > 0) {
    try {
      const result = await fetchCatalogDetails(missingIds);
      fetchedPrices = result.details;
      catalogFailed = !result.complete;
    } catch (error) {
      // 429 is expected on a shared IP. Keep going with cached and resale prices.
      catalogFailed = true;
      console.warn("catalog prices unavailable", error);
    }
    await saveCachedPrices(fetchedPrices);
  }

  const detailsById = new Map<number, RobloxAssetDetails>([
    ...cachedPrices,
    ...fetchedPrices.map((detail) => [detail.assetId, detail] as const),
  ]);
  const priceStatus = resolvePriceStatus(valuedIds.length, detailsById.size, catalogFailed);

  const inventory: ValuedItem[] = valuedIds.map((assetId) =>
    buildValuedItem(seeds.get(assetId)!, detailsById.get(assetId), thumbnails.get(assetId) ?? null),
  );

  const summary = summarizeValuedItems(inventory);
  inventory.sort((a, b) => (b.catalog_price ?? -1) - (a.catalog_price ?? -1));

  const fetchedAt = new Date().toISOString();
  const profileRow = {
    roblox_user_id: userId,
    username: reference.name,
    display_name: details?.displayName ?? reference.displayName,
    account_created_at: details?.createdAt ?? null,
    friends_count: friends,
    followers_count: followers,
    following_count: followings,
    avatar_url: headshotUrl,
    avatar_render_url: renderUrl,
    description: details?.description ?? null,
    has_verified_badge: details?.hasVerifiedBadge ?? reference.hasVerifiedBadge,
    is_banned: details?.isBanned ?? false,
    avatar_type: avatar?.avatarType ?? null,
    presence_status: presence?.status ?? null,
    presence_detail: presence?.detail ?? null,
    last_online_at: presence?.lastOnline ?? null,
    groups_count: groups === null ? null : groups.length,
    top_groups: groups === null ? null : topGroups(groups),
    lookup_status: details === null ? "unavailable" : failures.length === 0 ? "ok" : "partial",
    status_detail: failures.length === 0 ? null : `Unavailable right now: ${failures.join(", ")}.`,
    inventory_status: inventoryStatus,
    price_status: priceStatus,
    estimated_catalog_value: summary.estimatedCatalogValue,
    priced_item_count: summary.pricedItemCount,
    outfit_value: summary.outfitValue,
    limited_item_count: summary.limitedItemCount,
    limited_value: summary.limitedValue,
    inventory_value: summary.inventoryValue,
    inventory_item_count: owned === null ? summary.inventoryItemCount : owned.length,
    fetched_at: fetchedAt,
  };

  const inventoryRows = inventory.map((item) => ({
    ...item,
    roblox_user_id: userId,
    fetched_at: fetchedAt,
  }));

  await saveLookup(profileRow, inventoryRows);

  return { profile: profileRow, inventory };
}

Deno.serve({ port: Number(Deno.env.get("PORT") ?? "8000") }, async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    if (!USERNAME_PATTERN.test(username)) {
      return json({ error: "Enter a valid Roblox username (3 to 20 letters, numbers, or underscores)." }, 400);
    }

    const cached = await loadCachedLookup(username);
    if (cached) {
      return json({ ...cached, cached: true });
    }

    const result = await performLookup(username);
    return json({ ...result, cached: false });
  } catch (error) {
    if (error instanceof LookupError) {
      return json({ error: error.message }, error.status);
    }
    console.error("roblox-lookup failed", error);
    return json({ error: "The Roblox lookup could not be completed. Please try again." }, 500);
  }
});
