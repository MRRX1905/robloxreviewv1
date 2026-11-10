import { supabase } from '@/lib/supabase';
import type { GiftRule, QueueTier } from '@/types/live';

export type GiftRuleInput = Pick<GiftRule, 'gift_name' | 'coin_value' | 'tier' | 'enabled'>;

export async function listGiftRules(): Promise<GiftRule[]> {
  const { data, error } = await supabase
    .from('gift_rules')
    .select('*')
    .order('coin_value', { ascending: false });
  if (error) throw new Error('Gift rules could not be loaded.');
  return (data ?? []) as GiftRule[];
}

export async function createGiftRule(input: GiftRuleInput): Promise<void> {
  const { error } = await supabase.from('gift_rules').insert(input);
  if (error) throw new Error(error.code === '23505' ? 'A rule for that gift already exists.' : 'The gift rule could not be saved.');
}

export async function updateGiftRule(id: string, input: GiftRuleInput): Promise<void> {
  const { error } = await supabase
    .from('gift_rules')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.code === '23505' ? 'A rule for that gift already exists.' : 'The gift rule could not be updated.');
}

export async function setGiftRuleEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('gift_rules')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error('The gift rule could not be updated.');
}

export async function deleteGiftRule(id: string): Promise<void> {
  const { error } = await supabase.from('gift_rules').delete().eq('id', id);
  if (error) throw new Error('The gift rule could not be deleted.');
}
