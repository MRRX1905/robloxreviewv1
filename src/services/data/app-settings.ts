import { supabase } from '@/lib/supabase';

export async function getAppSetting<T>(key: string): Promise<T | null> {
  const { data, error } = await supabase
    .from('application_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) throw new Error(`Setting "${key}" could not be loaded.`);
  return (data?.value as T | undefined) ?? null;
}

export async function saveAppSetting(key: string, value: unknown): Promise<void> {
  const { error } = await supabase
    .from('application_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`Setting "${key}" could not be saved.`);
}
