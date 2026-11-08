import { redirect } from 'next/navigation';
import { OnboardingForm } from '@/components/onboarding-form';
import { createSupabaseServer, isSupabaseConfigured } from '@/lib/supabase/server';
export const dynamic = 'force-dynamic';
export default async function Onboarding() {
  if (!isSupabaseConfigured()) redirect('/login');
  const client = await createSupabaseServer();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect('/login');
  const { data, error } = await client.from('businesses').select('id').eq('id', user.id).maybeSingle();
  if (error) throw new Error('Database setup is not ready. Please apply the migration.');
  if (data) redirect('/dashboard');
  return <OnboardingForm email={user.email || ''} />;
}
