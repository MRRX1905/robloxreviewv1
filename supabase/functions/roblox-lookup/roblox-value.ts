import { assetTypeLabel, type RobloxAssetDetails } from "./roblox-api.ts";

export type RobloxItemAvailability = "limited" | "paid" | "off_sale" | "free" | "unknown";

export type RobloxItemRarity = "Limited" | "Legendary" | "Epic" | "Rare" | "Common";

export type RobloxPriceStatus = "ok" | "partial" | "unavailable";

export interface ItemSeed {
  assetId: number;
  name: string;
  assetType: string | null;
  isEquipped: boolean;
  collectible: { recentAveragePrice: number | null; originalPrice: number | null } | null;
}

export interface ValuedItem {
  asset_id: number;
  name: string;
  asset_type: string | null;
  is_equipped: boolean;
  is_limited: boolean;
  catalog_price: number | null;
  availability: RobloxItemAvailability;
  rarity: RobloxItemRarity;
  resale_price: number | null;
  original_price: number | null;
  thumbnail_url: string | null;
  creator_name: string | null;
}

export interface ValueSummary {
  estimatedCatalogValue: number | null;
  outfitValue: number | null;
  limitedValue: number | null;
  pricedItemCount: number;
  limitedItemCount: number;
  /** Every priced owned item, including off-sale items with a known value. */
  inventoryValue: number | null;
  inventoryItemCount: number;
  offSaleItemCount: number;
}

export interface CatalogClassification {
  isLimited: boolean;
  availability: RobloxItemAvailability;
  rarity: RobloxItemRarity;
  catalogPrice: number | null;
  resalePrice: number | null;
  originalPrice: number | null;
}

/**
 * Turns one catalog entry into the price shown to the streamer.
 * Limited items are valued at their lowest resale price, because their
 * original sale price is not what the item costs today.
 */
export function classifyCatalogEntry(asset: RobloxAssetDetails): CatalogClassification {
  const restrictions = asset.itemRestrictions;
  const isLimited =
    restrictions.includes("Limited")
    || restrictions.includes("LimitedUnique")
    || asset.hasResellers
    || (asset.lowestResalePrice ?? 0) > 0;

  const resalePrice = (asset.lowestResalePrice ?? 0) > 0 ? asset.lowestResalePrice : null;
  const originalPrice =
    (asset.price ?? 0) > 0 ? asset.price : (asset.lowestPrice ?? 0) > 0 ? asset.lowestPrice : null;
  const offSale = asset.isOffSale || asset.priceStatus === "Off Sale";
  const isFree = asset.priceStatus === "Free" || ((asset.price ?? 0) === 0 && !offSale);

  const availability: RobloxItemAvailability = isLimited
    ? "limited"
    : (asset.price ?? 0) > 0
      ? "paid"
      : offSale
        ? "off_sale"
        : isFree
          ? "free"
          : "unknown";

  const catalogPrice = isLimited
    ? resalePrice ?? originalPrice
    : availability === "paid"
      ? originalPrice
      : isFree
        ? 0
        : null;

  const basis = catalogPrice ?? 0;
  const rarity: RobloxItemRarity =
    isLimited || basis > 20_000
      ? "Limited"
      : basis > 5_000
        ? "Legendary"
        : basis > 500 || availability === "off_sale"
          ? "Epic"
          : basis > 0
            ? "Rare"
            : "Common";

  return { isLimited, availability, rarity, catalogPrice, resalePrice, originalPrice };
}

export function summarizeValuedItems(items: ValuedItem[]): ValueSummary {
  let pricedItems = 0;
  let limitedItems = 0;
  let offSaleItems = 0;
  let inventoryKnown = 0;
  let inventoryTotal = 0;
  let visibleKnown = 0;
  let visibleTotal = 0;
  let knownOutfitValues = 0;
  let knownLimitedValues = 0;
  let outfitTotal = 0;
  let limitedTotal = 0;

  for (const item of items) {
    if (item.is_limited) limitedItems += 1;
    if (item.availability === "off_sale") offSaleItems += 1;
    if (item.catalog_price === null) continue;

    inventoryKnown += 1;
    inventoryTotal += item.catalog_price;
    if (item.catalog_price > 0) pricedItems += 1;
    if (item.is_equipped || item.is_limited) {
      visibleKnown += 1;
      visibleTotal += item.catalog_price;
    }

    if (item.is_equipped) {
      knownOutfitValues += 1;
      outfitTotal += item.catalog_price;
    }
    if (item.is_limited) {
      knownLimitedValues += 1;
      limitedTotal += item.catalog_price;
    }
  }

  return {
    // Equipped and limited items can overlap, so this total is summed once over
    // the union rather than by adding the two tiles together.
    estimatedCatalogValue: visibleKnown > 0 ? visibleTotal : null,
    outfitValue: knownOutfitValues > 0 ? outfitTotal : null,
    limitedValue: knownLimitedValues > 0 ? limitedTotal : null,
    pricedItemCount: pricedItems,
    limitedItemCount: limitedItems,
    inventoryValue: inventoryKnown > 0 ? inventoryTotal : null,
    inventoryItemCount: items.length,
    offSaleItemCount: offSaleItems,
  };
}

/**
 * Builds one display row. When the catalog is throttled, limited items keep a
 * usable estimate from the public collectibles endpoint (recent average price).
 */
export function buildValuedItem(
  seed: ItemSeed,
  detail: RobloxAssetDetails | undefined,
  thumbnailUrl: string | null,
): ValuedItem {
  const classification = detail === undefined ? null : classifyCatalogEntry(detail);
  const collectiblePrice = seed.collectible?.recentAveragePrice ?? null;
  const fallbackPrice = collectiblePrice !== null && collectiblePrice > 0 ? collectiblePrice : null;
  const isLimited = classification?.isLimited ?? seed.collectible !== null;

  return {
    asset_id: seed.assetId,
    name: detail?.name ?? seed.name,
    asset_type:
      seed.assetType
      ?? (detail === undefined ? null : assetTypeLabel(detail.assetTypeId))
      ?? "Item",
    is_equipped: seed.isEquipped,
    is_limited: isLimited,
    catalog_price: classification?.catalogPrice ?? (isLimited ? fallbackPrice : null),
    availability: classification?.availability ?? (seed.collectible === null ? "unknown" : "limited"),
    rarity: classification?.rarity ?? (isLimited ? "Limited" : "Common"),
    resale_price: classification?.resalePrice ?? (isLimited ? fallbackPrice : null),
    original_price: classification?.originalPrice ?? seed.collectible?.originalPrice ?? null,
    thumbnail_url: thumbnailUrl,
    creator_name: detail?.creatorName ?? null,
  };
}

export function resolvePriceStatus(
  valuedItemCount: number,
  resolvedItemCount: number,
  catalogFailed = false,
): RobloxPriceStatus {
  if (valuedItemCount === 0 || !catalogFailed) return "ok";
  return resolvedItemCount === 0 ? "unavailable" : "partial";
}
