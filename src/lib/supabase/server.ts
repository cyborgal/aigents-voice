import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}
export async function createSupabaseServer() {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured. Add the project URL and publishable key.');
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    cookies: { getAll: () => jar.getAll(), setAll: values => { try { values.forEach(({ name, value, options }) => jar.set(name, value, options)); } catch { /* Proxy refreshes cookies for server components. */ } } },
  });
}
export function createAdmin() {
  if (!process.env.SUPABASE_SECRET_KEY) throw new Error('Server database key is not configured.');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
