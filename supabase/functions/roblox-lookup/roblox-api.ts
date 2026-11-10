const REQUEST_TIMEOUT_MS = 10_000;
const CATALOG_BATCH_SIZE = 100;
const THUMBNAIL_BATCH_SIZE = 100;
const HAT_ASSET_TYPE_ID = 8;

// Roblox only lists owned items per asset type. These are the types a player
// can own; fetchInventory reads every one of them for public inventories.
export const INVENTORY_ASSET_TYPE_IDS = [
  2, 8, 11, 12, 17, 18, 19,
  41, 42, 43, 44, 45, 46, 47,
  61, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79,
];
const MAX_INVENTORY_ITEMS = 1200;
const MAX_INVENTORY_PAGES_PER_TYPE = 20;

export const ASSET_TYPE_LABELS: Record<number, string> = {
  2: "T-Shirt",
  8: "Hat",
  11: "Shirt",
  12: "Pants",
  17: "Head",
  18: "Face",
  19: "Gear",
  41: "Hair",
  42: "Face Accessory",
  43: "Neck Accessory",
  44: "Shoulder Accessory",
  45: "Front Accessory",
  46: "Back Accessory",
  47: "Waist Accessory",
  61: "Emote",
  64: "T-Shirt Accessory",
  65: "Shirt Accessory",
  66: "Pants Accessory",
  67: "Jacket Accessory",
  68: "Sweater Accessory",
  69: "Shorts Accessory",
  70: "Left Shoe Accessory",
  71: "Right Shoe Accessory",
  72: "Dress or Skirt Accessory",
  73: "Eyebrow Accessory",
  74: "Eyelash Accessory",
  75: "Mood Animation",
  76: "Dynamic Head",
  77: "Face Makeup",
  78: "Lip Makeup",
  79: "Eye Makeup",
};

export function assetTypeLabel(assetTypeId: number | null): string | null {
  if (assetTypeId === null) return null;
  return ASSET_TYPE_LABELS[assetTypeId] ?? null;
}

export class RobloxApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export interface RobloxUserRef {
  id: number;
  name: string;
  displayName: string | null;
  hasVerifiedBadge: boolean;
}

export interface RobloxUserDetails {
  createdAt: string | null;
  displayName: string | null;
  description: string | null;
  isBanned: boolean;
  hasVerifiedBadge: boolean;
}

export interface RobloxAvatarAsset {
  assetId: number;
  name: string;
  assetType: string | null;
  assetTypeId: number | null;
}

export interface RobloxAvatarInfo {
  avatarType: string | null;
  assets: RobloxAvatarAsset[];
}

export interface RobloxCollectible {
  assetId: number;
  name: string;
  recentAveragePrice: number | null;
  originalPrice: number | null;
}

export interface RobloxOwnedItem {
  assetId: number;
  name: string;
  assetTypeId: number;
}

export type RobloxInventoryStatus = "ok" | "private" | "unavailable";

export type RobloxPresenceStatus = "offline" | "online" | "in_game" | "in_studio" | "unknown";

export interface RobloxPresence {
  status: RobloxPresenceStatus;
  detail: string | null;
  lastOnline: string | null;
}

export interface RobloxGroup {
  id: number;
  name: string;
  roleName: string;
  rank: number;
  memberCount: number;
  hasVerifiedBadge: boolean;
}

export interface RobloxAssetDetails {
  assetId: number;
  name: string;
  assetTypeId: number | null;
  price: number | null;
  lowestPrice: number | null;
  lowestResalePrice: number | null;
  isLimited: boolean;
  isOffSale: boolean;
  priceStatus: string | null;
  hasResellers: boolean;
  itemRestrictions: string[];
  creatorName: string | null;
  favoriteCount: number | null;
  totalQuantity: number | null;
}

async function sendRequest(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "User-Agent": "RobloxLiveStreamCenter/1.0",
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryDelayMs(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  const seconds = header === null ? Number.NaN : Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(seconds * 1000, 5000);
  return Math.min(400 * 2 ** (attempt - 1), 3000) + Math.floor(Math.random() * 150);
}

async function sendWithRetry(
  url: string,
  init: RequestInit = {},
  attempts = 3,
): Promise<Response> {
  let response = await sendRequest(url, init);
  for (let attempt = 1; attempt < attempts && RETRYABLE_STATUSES.has(response.status); attempt += 1) {
    await sleep(retryDelayMs(response, attempt));
    response = await sendRequest(url, init);
  }
  return response;
}

async function requestJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await sendWithRetry(url, init);
  if (!response.ok) {
    throw new RobloxApiError(response.status, `Roblox responded with status ${response.status}`);
  }
  return response.json();
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  return requestJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export async function resolveUsername(username: string): Promise<RobloxUserRef | null> {
  const data = asRecord(
    await postJson("https://users.roblox.com/v1/usernames/users", {
      usernames: [username],
      excludeBannedUsers: false,
    }),
  );
  const match = asArray(data.data).map(asRecord).find((entry) => asNumber(entry.id) !== null);
  if (!match) return null;
  return {
    id: asNumber(match.id) as number,
    name: asString(match.name) ?? username,
    displayName: asString(match.displayName),
    hasVerifiedBadge: match.hasVerifiedBadge === true,
  };
}

export async function fetchUserDetails(userId: number): Promise<RobloxUserDetails> {
  const data = asRecord(await requestJson(`https://users.roblox.com/v1/users/${userId}`));
  return {
    createdAt: asString(data.created),
    displayName: asString(data.displayName),
    description: asString(data.description),
    isBanned: data.isBanned === true,
    hasVerifiedBadge: data.hasVerifiedBadge === true,
  };
}

export async function fetchCount(url: string): Promise<number> {
  const data = asRecord(await requestJson(url));
  const count = asNumber(data.count);
  if (count === null) throw new RobloxApiError(502, "Unexpected count response");
  return count;
}

export async function fetchAvatar(userId: number): Promise<RobloxAvatarInfo> {
  const data = asRecord(await requestJson(`https://avatar.roblox.com/v1/users/${userId}/avatar`));
  return {
    avatarType: asString(data.playerAvatarType),
    assets: asArray(data.assets)
      .map(asRecord)
      .flatMap((asset) => {
        const assetId = asNumber(asset.id);
        if (assetId === null) return [];
        const assetType = asRecord(asset.assetType);
        return [{
          assetId,
          name: asString(asset.name) ?? `Asset ${assetId}`,
          assetType: asString(assetType.name),
          assetTypeId: asNumber(assetType.id),
        }];
      }),
  };
}

export async function fetchCollectibles(userId: number): Promise<RobloxCollectible[]> {
  const items = new Map<number, RobloxCollectible>();
  let cursor: string | null = null;

  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({ limit: "100", sortOrder: "Asc" });
    if (cursor !== null) params.set("cursor", cursor);
    const data = asRecord(
      await requestJson(
        `https://inventory.roblox.com/v1/users/${userId}/assets/collectibles?${params.toString()}`,
      ),
    );
    for (const entry of asArray(data.data).map(asRecord)) {
      const assetId = asNumber(entry.assetId);
      if (assetId === null || items.has(assetId)) continue;
      items.set(assetId, {
        assetId,
        name: asString(entry.name) ?? `Asset ${assetId}`,
        recentAveragePrice: asNumber(entry.recentAveragePrice),
        originalPrice: asNumber(entry.originalPrice),
      });
    }
    cursor = asString(data.nextPageCursor);
    if (cursor === null) break;
  }

  return [...items.values()];
}

async function forEachWithLimit<T>(
  values: T[],
  limit: number,
  run: (value: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (nextIndex < values.length) {
      const value = values[nextIndex];
      nextIndex += 1;
      await run(value);
    }
  });
  await Promise.all(workers);
}

/**
 * Reads every page of every owned asset type. Roblox has no aggregate endpoint
 * for other players, so one request per page per type is the only public way to
 * see the whole inventory. Types that error (unsupported or hidden) are skipped.
 */
export async function fetchInventory(userId: number): Promise<RobloxOwnedItem[]> {
  const items = new Map<number, RobloxOwnedItem>();

  await forEachWithLimit(INVENTORY_ASSET_TYPE_IDS, 4, async (assetTypeId) => {
    let cursor: string | null = null;
    for (let page = 0; page < MAX_INVENTORY_PAGES_PER_TYPE; page += 1) {
      if (items.size >= MAX_INVENTORY_ITEMS) return;
      const params = new URLSearchParams({ limit: "100", sortOrder: "Asc" });
      if (cursor !== null) params.set("cursor", cursor);
      let data: Record<string, unknown>;
      try {
        data = asRecord(
          await requestJson(
            `https://inventory.roblox.com/v2/users/${userId}/inventory/${assetTypeId}?${params.toString()}`,
          ),
        );
      } catch {
        // A type the account does not own, or one Roblox refuses, is not fatal.
        return;
      }
      for (const entry of asArray(data.data).map(asRecord)) {
        const assetId = asNumber(entry.assetId);
        if (assetId === null || items.has(assetId)) continue;
        items.set(assetId, {
          assetId,
          name: asString(entry.assetName) ?? `Asset ${assetId}`,
          assetTypeId,
        });
      }
      cursor = asString(data.nextPageCursor);
      if (cursor === null) return;
    }
  });

  return [...items.values()];
}

/**
 * Roblox only exposes owned items per asset type to anonymous clients.
 * The old aggregate inventory endpoint returns 403 for every public account.
 */
export async function probeInventoryStatus(userId: number): Promise<RobloxInventoryStatus> {
  try {
    await requestJson(
      `https://inventory.roblox.com/v2/users/${userId}/inventory/${HAT_ASSET_TYPE_ID}?limit=10&sortOrder=Asc`,
    );
    return "ok";
  } catch (error) {
    if (error instanceof RobloxApiError && error.status === 403) return "private";
    return "unavailable";
  }
}

export async function fetchPresence(userId: number): Promise<RobloxPresence> {
  const data = asRecord(
    await postJson("https://presence.roblox.com/v1/presence/users", { userIds: [userId] }),
  );
  const entry = asRecord(asArray(data.userPresences)[0]);
  const type = asNumber(entry.userPresenceType);
  const status: RobloxPresenceStatus =
    type === 0 ? "offline"
    : type === 1 ? "online"
    : type === 2 ? "in_game"
    : type === 3 ? "in_studio"
    : "unknown";

  let detail: string | null = null;
  if (status === "in_game") {
    const universeId = asNumber(entry.universeId);
    const gameName = universeId === null ? null : await fetchGameName(universeId).catch(() => null);
    detail = gameName === null ? "In a game" : `Playing ${gameName}`;
  } else if (status === "in_studio") {
    detail = "In Roblox Studio";
  } else if (status === "online") {
    detail = "On the Roblox website";
  }

  return { status, detail, lastOnline: asString(entry.lastOnline) };
}

async function fetchGameName(universeId: number): Promise<string | null> {
  const data = asRecord(
    await requestJson(`https://games.roblox.com/v1/games?universeIds=${universeId}`),
  );
  return asString(asRecord(asArray(data.data)[0]).name);
}

export async function fetchGroups(userId: number): Promise<RobloxGroup[]> {
  const data = asRecord(
    await requestJson(`https://groups.roblox.com/v2/users/${userId}/groups/roles`),
  );
  return asArray(data.data).map(asRecord).flatMap((entry) => {
    const group = asRecord(entry.group);
    const role = asRecord(entry.role);
    const id = asNumber(group.id);
    const name = asString(group.name);
    if (id === null || name === null) return [];
    return [{
      id,
      name,
      roleName: asString(role.name) ?? "Member",
      rank: asNumber(role.rank) ?? 0,
      memberCount: asNumber(group.memberCount) ?? 0,
      hasVerifiedBadge: group.hasVerifiedBadge === true,
    }];
  });
}

let catalogXsrfToken: string | null = null;

async function postCatalogDetails(body: string): Promise<unknown> {
  const url = "https://catalog.roblox.com/v1/catalog/items/details";
  const send = (token: string | null) =>
    sendRequest(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token === null ? {} : { "X-CSRF-TOKEN": token }),
      },
      body,
    });

  let response = await send(catalogXsrfToken);
  if (response.status === 403) {
    // Roblox answers the first unsigned POST with a fresh XSRF token.
    const token = response.headers.get("x-csrf-token");
    if (token !== null) {
      catalogXsrfToken = token;
      response = await send(token);
    }
  }
  if (response.status === 429) {
    // Catalog detail pricing allows 10 requests per minute per IP and usually
    // asks for ~5s. Waiting that long blocks a live review, so only short
    // throttles are retried and the caller falls back to cached/resale prices.
    const retryAfter = Number(response.headers.get("retry-after") ?? "0");
    if (Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 2) {
      await sleep(retryAfter * 1000 + 250);
      response = await send(catalogXsrfToken);
    }
  }
  if (!response.ok) {
    throw new RobloxApiError(response.status, `Roblox responded with status ${response.status}`);
  }
  return response.json();
}

export interface RobloxCatalogDetailsResult {
  details: RobloxAssetDetails[];
  /** False when at least one batch request failed, for example with a 429. */
  complete: boolean;
}

export async function fetchCatalogDetails(assetIds: number[]): Promise<RobloxCatalogDetailsResult> {
  const unique = [...new Set(assetIds)].filter((id) => Number.isFinite(id));
  const details: RobloxAssetDetails[] = [];
  let failedBatches = 0;
  let lastError: unknown = null;

  for (let start = 0; start < unique.length; start += CATALOG_BATCH_SIZE) {
    const batch = unique.slice(start, start + CATALOG_BATCH_SIZE);
    if (start > 0) await sleep(250);
    try {
      const data = asRecord(
        await postCatalogDetails(
          JSON.stringify({ items: batch.map((id) => ({ itemType: "Asset", id })) }),
        ),
      );
      for (const entry of asArray(data.data).map(asRecord)) {
        const assetId = asNumber(entry.id);
        if (assetId === null) continue;
        details.push({
          assetId,
          name: asString(entry.name) ?? `Asset ${assetId}`,
          assetTypeId: asNumber(entry.assetType),
          price: asNumber(entry.price),
          lowestPrice: asNumber(entry.lowestPrice),
          lowestResalePrice: asNumber(entry.lowestResalePrice),
          isLimited:
            entry.itemRestrictions instanceof Array
              && (entry.itemRestrictions.includes("Limited") || entry.itemRestrictions.includes("LimitedUnique")),
          isOffSale: entry.isOffSale === true,
          priceStatus: asString(entry.priceStatus),
          hasResellers: entry.hasResellers === true,
          itemRestrictions: asArray(entry.itemRestrictions).filter(
            (value): value is string => typeof value === "string",
          ),
          creatorName: asString(entry.creatorName),
          favoriteCount: asNumber(entry.favoriteCount),
          totalQuantity: asNumber(entry.totalQuantity),
        });
      }
    } catch (error) {
      failedBatches += 1;
      lastError = error;
    }
  }

  const batchCount = Math.ceil(unique.length / CATALOG_BATCH_SIZE);
  if (batchCount > 0 && failedBatches === batchCount && lastError !== null) throw lastError;

  // Assets that Roblox no longer lists are simply absent from a successful
  // response; that is not a throttling failure.
  return { details, complete: failedBatches === 0 };
}

export async function fetchAssetThumbnails(assetIds: number[]): Promise<Map<number, string>> {
  const unique = [...new Set(assetIds)].filter((id) => Number.isFinite(id));
  const thumbnails = new Map<number, string>();

  for (let start = 0; start < unique.length; start += THUMBNAIL_BATCH_SIZE) {
    const batch = unique.slice(start, start + THUMBNAIL_BATCH_SIZE);
    try {
      const data = asRecord(
        await requestJson(
          `https://thumbnails.roblox.com/v1/assets?assetIds=${batch.join(",")}&size=150x150&format=Png`,
        ),
      );
      for (const entry of asArray(data.data).map(asRecord)) {
        const targetId = asNumber(entry.targetId);
        const imageUrl = asString(entry.imageUrl);
        if (targetId !== null && imageUrl !== null) thumbnails.set(targetId, imageUrl);
      }
    } catch {
      // Item images are cosmetic; never fail a lookup over them.
    }
  }

  return thumbnails;
}

async function fetchUserThumbnail(userId: number, kind: "avatar" | "avatar-headshot", size: string): Promise<string | null> {
  const data = asRecord(
    await requestJson(
      `https://thumbnails.roblox.com/v1/users/${kind}?userIds=${userId}&size=${size}&format=Png&isCircular=false`,
    ),
  );
  return asString(asRecord(asArray(data.data)[0]).imageUrl);
}

export function fetchAvatarHeadshotUrl(userId: number): Promise<string | null> {
  return fetchUserThumbnail(userId, "avatar-headshot", "420x420");
}

export function fetchAvatarFullBodyUrl(userId: number): Promise<string | null> {
  return fetchUserThumbnail(userId, "avatar", "720x720");
}
