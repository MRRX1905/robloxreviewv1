import { FUNCTIONS_BASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import type { RobloxLookupResult } from '@/types/live';

function isLookupResult(value: unknown): value is RobloxLookupResult {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<RobloxLookupResult>;
  return (
    typeof candidate.profile === 'object' &&
    candidate.profile !== null &&
    typeof candidate.profile.username === 'string' &&
    Array.isArray(candidate.inventory)
  );
}

export async function lookupRobloxAccount(username: string): Promise<RobloxLookupResult> {
  let response: Response;
  try {
    response = await fetch(`${FUNCTIONS_BASE_URL}/roblox-lookup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ username }),
    });
  } catch {
    throw new Error('The lookup service could not be reached. Check your internet connection.');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'error' in body ? String(body.error) : null;
    throw new Error(message ?? 'The Roblox lookup could not be completed.');
  }
  if (!isLookupResult(body)) {
    throw new Error('The lookup returned an unexpected response.');
  }
  return body;
}
