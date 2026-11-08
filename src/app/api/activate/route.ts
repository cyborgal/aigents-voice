import { NextResponse } from 'next/server';
import { apiError, ApiError, requireSameOrigin, requireUser } from '@/lib/api';
import { createAdmin } from '@/lib/supabase/server';
import { integrationMode, voiceAdapter } from '@/lib/voice';
import type { Business } from '@/lib/types';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { user, supabase } = await requireUser();
    const { data: business, error } = await supabase.from('businesses').select('*').eq('id', user.id).single();
    if (error || !business) throw new ApiError('Complete onboarding before activating your agent.', 409);
    const mode = integrationMode();
    if (business.activation_status === 'active' && business.integration_mode === mode) return NextResponse.json({ business });
    const admin = createAdmin();
    // Compare-and-set serializes activation across simultaneous requests.
    const { data: claimed, error: claimError } = await admin.from('businesses').update({ activation_status: 'pending', integration_mode: mode }).eq('id', user.id).neq('activation_status', 'pending').select().maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) throw new ApiError('Activation is already in progress. Refresh shortly.', 409);
    try {
      const result = await voiceAdapter().activate({ ...business, integration_mode: mode } as Business);
      if (!result.active || !result.clientId) throw new ApiError('The voice service did not confirm activation. Please try again.', 502);
      const { data, error: saveError } = await admin.from('businesses').update({ activation_status: 'active', external_client_id: result.clientId, integration_mode: mode }).eq('id', user.id).select().single();
      if (saveError) throw saveError;
      return NextResponse.json({ business: data });
    } catch (error) {
      await admin.from('businesses').update({ activation_status: 'failed' }).eq('id', user.id);
      throw error;
    }
  } catch (error) { return apiError(error); }
}
