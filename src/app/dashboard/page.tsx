import { redirect } from 'next/navigation';
import { CommandCenter } from '@/components/command-center';
import { createSupabaseServer, isSupabaseConfigured } from '@/lib/supabase/server';
import { integrationMode } from '@/lib/voice';
import type { Business, CallRecord } from '@/lib/types';
export const dynamic = 'force-dynamic';
export default async function Dashboard() {
  if (!isSupabaseConfigured()) redirect('/login');
  const client = await createSupabaseServer();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect('/login');
  const [{ data: business, error: businessError }, { data: calls, error: callsError }] = await Promise.all([
    client.from('businesses').select('*').eq('id', user.id).maybeSingle(),
    client.from('calls').select('id,prospect_name,phone_masked,direction,status,outcome,duration_seconds,summary,mode,created_at').eq('user_id', user.id).eq('mode', integrationMode()).order('created_at', { ascending: false }).limit(200),
  ]);
  if (businessError || callsError) throw new Error('Unable to load your command center. Please check the database configuration.');
  if (!business) redirect('/onboarding');
  const visibleBusiness = { ...business, activation_status: business.integration_mode === integrationMode() ? business.activation_status : 'inactive' };
  return <CommandCenter business={visibleBusiness as Business} calls={(calls || []) as CallRecord[]} email={user.email || ''} mode={integrationMode()} />;
}
