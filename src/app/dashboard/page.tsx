import { redirect } from 'next/navigation';
import { CommandCenter } from '@/components/command-center';
import { createSupabaseServer, isSupabaseConfigured } from '@/lib/supabase/server';
import type { Business, CallRecord } from '@/lib/types';
export const dynamic = 'force-dynamic';
export default async function Dashboard() {
  if (!isSupabaseConfigured()) redirect('/login');
  const client = await createSupabaseServer();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect('/login');
  const [{ data: business, error: businessError }, { data: calls, error: callsError }, { data: leads, error: leadsError }] = await Promise.all([
    client.from('businesses').select('*').eq('id', user.id).maybeSingle(),
    client.from('calls').select('id,prospect_name,phone_masked,direction,status,outcome,duration_seconds,billed_minutes,bonzo_prospect_id,summary,mode,created_at').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200),
    client.from('leads').select('id,bonzo_prospect_id,full_name,phone,email,lead_source,loan_type,desired_loan_amount,bonzo_status,do_not_call,created_at').eq('business_id', user.id).order('created_at', { ascending: false }).limit(100),
  ]);
  if (businessError || callsError || leadsError) throw new Error('Unable to load your command center. Please check the database configuration.');
  if (!business) redirect('/onboarding');
  return <CommandCenter business={business as Business} calls={(calls || []).filter(c => c.mode === business.integration_mode) as CallRecord[]} leads={leads || []} email={user.email || ''} mode={business.integration_mode} />;
}
