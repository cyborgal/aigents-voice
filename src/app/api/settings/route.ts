import { NextResponse } from 'next/server';
import { apiError, ApiError, readBody, requireSameOrigin, requireUser } from '@/lib/api';
import { createAdmin } from '@/lib/supabase/server';
import { businessSchema } from '@/lib/validation';
import { integrationMode, voiceAdapter } from '@/lib/voice';
import type { Business } from '@/lib/types';
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const { user, supabase } = await requireUser();
    const input = businessSchema.parse(await readBody(request));
    const { data: existing, error: readError } = await supabase.from('businesses').select('*').eq('id', user.id).single();
    if (readError || !existing) throw new ApiError('Complete onboarding first.', 409);
    if (existing.activation_status === 'pending') throw new ApiError('Wait for activation to finish before changing settings.', 409);
    if (existing.integration_mode === 'demo' && existing.activation_status === 'active') {
      await voiceAdapter().updateSettings({ ...existing, ...input } as Business);
    }
    const { data, error } = await createAdmin().from('businesses').update(input).eq('id', user.id).select().single();
    if (error) throw error;
    return NextResponse.json({ business: data });
  } catch (error) { return apiError(error); }
}
