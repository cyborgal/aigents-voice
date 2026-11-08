import { NextResponse } from 'next/server';
import { apiError, ApiError, requireSameOrigin, requireUser } from '@/lib/api';
import { createAdmin } from '@/lib/supabase/server';
import { integrationMode, voiceAdapter } from '@/lib/voice';
import type { Business } from '@/lib/types';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { user, supabase } = await requireUser();
    const { data: business } = await supabase.from('businesses').select('*').eq('id', user.id).single();
    if (!business || business.activation_status !== 'active' || business.integration_mode !== integrationMode()) throw new ApiError('Activate your agent before syncing activity.', 409);
    const mode = integrationMode();
    const result = await voiceAdapter().sync(business as Business);
    const admin = createAdmin();
    for (const call of result.calls) {
      // Tenant identity comes exclusively from the verified session, never a provider record.
      const { error } = await admin.from('calls').upsert({ user_id: user.id, external_id: call.externalId, prospect_name: call.prospectName, phone_masked: call.phoneMasked, direction: call.direction, status: call.status, outcome: call.outcome, duration_seconds: call.durationSeconds, summary: call.summary, mode, created_at: call.createdAt, idempotency_key: crypto.randomUUID() }, { onConflict: 'user_id,external_id,mode', ignoreDuplicates: true });
      if (error) throw error;
      const { error: updateError } = await admin.from('calls').update({ status: call.status, outcome: call.outcome, duration_seconds: call.durationSeconds, summary: call.summary, prospect_name: call.prospectName }).eq('user_id', user.id).eq('external_id', call.externalId).eq('mode', mode);
      if (updateError) throw updateError;
    }
    const { data: calls, error } = await supabase.from('calls').select('*').eq('user_id', user.id).eq('mode', mode).order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    return NextResponse.json({ calls, usage: result.usage || null });
  } catch (error) { return apiError(error); }
}
