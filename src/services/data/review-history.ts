import { supabase } from '@/lib/supabase';
import { escapeLikePattern, sanitizeSearchTerm } from '@/lib/search';
import type { QueueTier, ReviewHistoryRecord } from '@/types/live';

export type HistoryStatusFilter = 'all' | ReviewHistoryRecord['status'];
export type HistoryTierFilter = 'all' | QueueTier;

export interface HistoryQuery {
  search: string;
  status: HistoryStatusFilter;
  tier: HistoryTierFilter;
  page: number;
  pageSize: number;
}

export interface HistoryPage {
  rows: ReviewHistoryRecord[];
  total: number;
}

const HISTORY_COLUMNS =
  'id, queue_id, tiktok_username, roblox_username, tier, status, estimated_catalog_value, review_started_at, review_ended_at, duration_seconds, created_at';

type FilterFields = Pick<HistoryQuery, 'search' | 'status' | 'tier'>;

function applyFilters<T extends { or: (filters: string) => T; eq: (column: string, value: string) => T }>(
  builder: T,
  query: FilterFields,
): T {
  let next = builder;
  const term = sanitizeSearchTerm(query.search);
  if (term) {
    const pattern = `%${escapeLikePattern(term)}%`;
    next = next.or(`roblox_username.ilike.${pattern},tiktok_username.ilike.${pattern}`);
  }
  if (query.status !== 'all') next = next.eq('status', query.status);
  if (query.tier !== 'all') next = next.eq('tier', query.tier);
  return next;
}

export async function listReviewHistory(query: HistoryQuery): Promise<HistoryPage> {
  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;
  const base = supabase.from('review_history').select(HISTORY_COLUMNS, { count: 'exact' });
  const { data, error, count } = await applyFilters(base, query)
    .order('review_ended_at', { ascending: false })
    .range(from, to);
  if (error) throw new Error('Review history could not be loaded.');
  return { rows: (data ?? []) as ReviewHistoryRecord[], total: count ?? 0 };
}

export async function listAllHistoryForExport(query: Omit<HistoryQuery, 'page' | 'pageSize'>): Promise<ReviewHistoryRecord[]> {
  const base = supabase.from('review_history').select(HISTORY_COLUMNS);
  const { data, error } = await applyFilters(base, query)
    .order('review_ended_at', { ascending: false })
    .limit(10000);
  if (error) throw new Error('The history could not be prepared for export.');
  return (data ?? []) as ReviewHistoryRecord[];
}
