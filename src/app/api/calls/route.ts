import { NextResponse } from 'next/server';
import { apiError, ApiError, readBody, requireSameOrigin, requireUser } from '@/lib/api';
import { createAdmin } from '@/lib/supabase/server';
import { callSchema, isWithinCallingHours, maskPhone, normalizePhone } from '@/lib/validation';
import { integrationMode, voiceAdapter } from '@/lib/voice';
import type { Business } from '@/lib/types';

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { user, supabase } = await requireUser();
    const input = callSchema.parse(await readBody(request));
    const { data: business } = await supabase.from('businesses').select('*').eq('id', user.id).single();
    const mode = business?.integration_mode || integrationMode();
    if (!business || business.activation_status !== 'active') throw new ApiError('Your voice agent is not active yet.', 409);
    if (mode === 'live') {
      if (business.id !== 'a7c3c543-c31a-4d2a-8e8d-79d0c55cd442' || business.external_client_id !== 'pbui@westcapitallending.com') throw new ApiError('Live test calling is not provisioned for this workspace.', 403);
      const allowed = ['+19497775744'];
      if (!allowed.includes(input.phone)) throw new ApiError('This number is not approved for test calling. Ask your administrator to add it to the test allowlist.', 403);
      if (!isWithinCallingHours(business)) throw new ApiError('Test calls are available only during your configured calling days and hours.', 403);
    }
    const admin = createAdmin();
    const { data: reserved, error: reserveError } = await admin.rpc('reserve_test_call', { p_user_id: user.id, p_idempotency_key: input.idempotencyKey, p_phone_masked: maskPhone(input.phone), p_mode: mode });
    if (reserveError) {
      if (reserveError.code === 'P0001') throw new ApiError(reserveError.message, 429);
      if (reserveError.code === '22023') throw new ApiError('This request key was already used for a different call.', 409);
      throw reserveError;
    }
    const reservation = reserved?.[0];
    if (!reservation) throw new ApiError('Unable to reserve a test call.', 503);
    // Claim once before HTTP dispatch. Unknown is deliberate: a timeout must not
    // trigger another real phone call, and requests may be retried concurrently.
    const { data: claimed, error: claimError } = await admin.from('calls').update({ status: 'unknown', outcome: 'Initiation pending confirmation' }).eq('id', reservation.id).eq('user_id', user.id).eq('status', 'queued').is('external_id', null).select().maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) return NextResponse.json({ call: reservation, message: 'This request has already been submitted. Refresh activity for its latest status.' });
    let result;
    try {
      if (mode === 'live') {
        const secret = process.env.N8N_VOICE_WEBHOOK_SECRET;
        if (!secret) throw new Error('Missing voice webhook secret');
        const response = await fetch('https://flows.aigentsgroup.com/webhook/aigents-voice-test-call', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-aigents-secret': secret }, body: JSON.stringify({ lo_email: business.external_client_id, phone: input.phone, prospect_name: input.prospectName || 'Test Caller' }), signal: AbortSignal.timeout(15000), cache: 'no-store', redirect: 'error' });
        if (!response.ok) throw new Error('Voice webhook rejected request');
        const payload = await response.json();
        if (payload?.success !== true || payload?.status !== 'initiated' || typeof payload.call_id !== 'string') throw new Error('Voice webhook did not confirm call');
        result = { accepted: true, externalId: payload.call_id, status: 'queued' };
      } else result = await voiceAdapter().startCall(business as Business, input.phone, input.idempotencyKey);
    }
    catch {
      return NextResponse.json({ call: claimed, message: 'The service did not confirm initiation. The outcome is unknown; refresh activity before placing another call.' }, { status: 202 });
    }
    const { data: call, error: saveError } = await admin.from('calls').update({ external_id: mode === 'live' ? null : result.externalId || null, status: result.accepted ? result.status : 'rejected', outcome: mode === 'demo' ? 'Simulated test — no phone call placed' : 'Test call initiated; completion may appear separately', duration_seconds: mode === 'demo' ? 42 : null, summary: mode === 'demo' ? 'Demonstration only. Your personalized assistant introduced your business and offered a follow-up. No person was contacted.' : null }).eq('id', reservation.id).eq('user_id', user.id).select().single();
    if (saveError) throw saveError;
    return NextResponse.json({ call, message: mode === 'demo' ? 'Demo call simulated. No real phone call was placed.' : result.accepted ? 'Your test call was accepted by the voice service.' : 'The voice service rejected this test call.' }, { status: result.accepted ? 200 : 422 });
  } catch (error) { return apiError(error); }
}

export async function GET() {
  try {
    const { user, supabase } = await requireUser();
    const { data: business } = await supabase.from('businesses').select('integration_mode').eq('id', user.id).single();
    const { data: calls, error } = await supabase.from('calls').select('*').eq('user_id', user.id).eq('mode', business?.integration_mode || 'demo').order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    return NextResponse.json({ calls }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return apiError(error); }
}
