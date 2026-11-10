import { supabase } from '@/lib/supabase';
import { startOfLocalDayIso } from '@/lib/format';

export interface DashboardStats {
  reviewsToday: number;
  accountsReviewed: number;
  giftsReceived: number;
  giftCoins: number;
  averageReviewSeconds: number | null;
}

export async function loadDashboardStats(): Promise<DashboardStats> {
  const [todayCount, totalCount, gifts, durations] = await Promise.all([
    supabase
      .from('review_history')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('review_ended_at', startOfLocalDayIso()),
    supabase
      .from('review_history')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed'),
    supabase.from('gift_transactions').select('total_coins').limit(5000),
    supabase
      .from('review_history')
      .select('duration_seconds')
      .eq('status', 'completed')
      .not('duration_seconds', 'is', null)
      .order('review_ended_at', { ascending: false })
      .limit(200),
  ]);

  const failed = [todayCount, totalCount, gifts, durations].find((result) => result.error);
  if (failed?.error) throw new Error('Dashboard statistics could not be loaded.');

  const giftRows = (gifts.data ?? []) as { total_coins: number }[];
  const durationRows = (durations.data ?? []) as { duration_seconds: number }[];
  const averageReviewSeconds = durationRows.length > 0
    ? durationRows.reduce((sum, row) => sum + row.duration_seconds, 0) / durationRows.length
    : null;

  return {
    reviewsToday: todayCount.count ?? 0,
    accountsReviewed: totalCount.count ?? 0,
    giftsReceived: giftRows.length,
    giftCoins: giftRows.reduce((sum, row) => sum + row.total_coins, 0),
    averageReviewSeconds,
  };
}
