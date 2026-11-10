import type { NarrationStyle, RobloxLookupResult } from '@/types/live';

export const NARRATION_STYLES: { value: NarrationStyle; label: string; description: string }[] = [
  { value: 'funny', label: 'Funny', description: 'Playful and light-hearted commentary.' },
  { value: 'savage_friendly', label: 'Savage but friendly', description: 'Cheeky roasts that stay warm.' },
  { value: 'professional', label: 'Professional', description: 'Calm, factual review tone.' },
  { value: 'gaming_commentator', label: 'Gaming commentator', description: 'Energetic play-by-play style.' },
  { value: 'dramatic', label: 'Dramatic', description: 'Big reveal, movie-trailer pacing.' },
];

export function formatRobux(value: number): string {
  return `${value.toLocaleString('en-US')} R$`;
}

/**
 * Builds narration text only from verified fields of a lookup result.
 * Nothing is invented: missing values are omitted from the script.
 */
export function buildNarration(result: RobloxLookupResult, style: NarrationStyle): string {
  const { profile, inventory } = result;
  const name = profile.display_name ?? profile.username;
  const equipped = inventory.filter((item) => item.is_equipped);
  const topPriced = [...inventory]
    .filter((item) => item.catalog_price !== null)
    .sort((a, b) => (b.catalog_price ?? 0) - (a.catalog_price ?? 0))[0];

  const valueLine =
    profile.estimated_catalog_value !== null
      ? `Estimated catalog value from ${profile.priced_item_count} priced item(s) is ${formatRobux(profile.estimated_catalog_value)}.`
      : 'No priced items are available to calculate a catalog value for this account.';
  const topLine = topPriced
    ? `The highest-priced item is ${topPriced.name}, at ${formatRobux(topPriced.catalog_price ?? 0)}.`
    : '';
  const equippedLine = equipped.length > 0 ? `${equipped.length} item(s) are currently equipped.` : '';

  const openers: Record<NarrationStyle, string> = {
    funny: `Whoa, ${name}'s account is pretty impressive!`,
    savage_friendly: `Alright ${name}, let's see the collection. Don't worry, we're nice.`,
    professional: `Here is the review summary for ${name}'s account.`,
    gaming_commentator: `And now we move on to the account review for ${name}!`,
    dramatic: `The curtain rises... ${name}'s account takes the spotlight!`,
  };

  return [openers[style], equippedLine, topLine, valueLine].filter(Boolean).join(' ');
}
