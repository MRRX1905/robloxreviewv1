export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/** Roblox and TikTok handles only contain letters, digits, and underscores. */
export function sanitizeSearchTerm(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 40);
}
