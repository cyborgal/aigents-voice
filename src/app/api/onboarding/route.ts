import { NextResponse } from 'next/server';
import { apiError, ApiError, readBody, requireSameOrigin, requireUser } from '@/lib/api';
import { createAdmin } from '@/lib/supabase/server';
import { businessSchema } from '@/lib/validation';
import { integrationMode } from '@/lib/voice';
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { user, supabase } = await requireUser();
    const input = businessSchema.parse(await readBody(request));
    const { data: existing, error: readError } = await supabase.from('businesses').select('id').eq('id', user.id).maybeSingle();
    if (readError) throw readError;
    if (existing) throw new ApiError('Your business is already set up. Update it from Settings.', 409);
    const { data, error } = await createAdmin().from('businesses').insert({ ...input, id: user.id, integration_mode: integrationMode() }).select().single();
    if (error) throw error;
    return NextResponse.json({ business: data, redirect: '/dashboard' });
  } catch (error) { return apiError(error); }
}
