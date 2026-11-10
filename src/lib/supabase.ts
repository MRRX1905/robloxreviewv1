import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase connection settings are missing from the environment.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const FUNCTIONS_BASE_URL =
  import.meta.env.VITE_FUNCTIONS_BASE_URL ?? `${supabaseUrl}/functions/v1`;
export const SUPABASE_ANON_KEY = supabaseAnonKey;
