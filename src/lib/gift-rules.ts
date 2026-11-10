import type { GiftRule, QueueTier } from '@/types/live';

export function normalizeGiftName(name: string): string {
  return name.trim().toLowerCase();
}

export function findGiftRule(rules: GiftRule[], giftName: string): GiftRule | undefined {
  const key = normalizeGiftName(giftName);
  return rules.find((rule) => rule.enabled && normalizeGiftName(rule.gift_name) === key);
}

/**
 * Returns the tier a validated gift earns, or null when no enabled rule matches
 * or the gift's coin value is unknown. Unknown values never earn priority.
 */
export function resolveGiftTier(rule: GiftRule | undefined, totalCoins: number | null): QueueTier | null {
  if (!rule || totalCoins === null) return null;
  return totalCoins >= rule.coin_value ? rule.tier : null;
}
