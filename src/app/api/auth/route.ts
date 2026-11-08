import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiError, ApiError, readBody, requireSameOrigin } from '@/lib/api';
import { createSupabaseServer, isSupabaseConfigured } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    if (!isSupabaseConfigured()) throw new ApiError('Account setup is not connected yet. Explore the demo while configuration is completed.', 503);
    const input = z.object({ mode: z.enum(['login','signup']), email: z.email(), password: z.string().min(8).max(128), name: z.string().trim().max(120).optional() }).parse(await readBody(request));
    const supabase = await createSupabaseServer();
    if (input.mode === 'signup') {
      const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
      const { data, error } = await supabase.auth.signUp({ email: input.email, password: input.password, options: { data: { full_name: input.name || '' }, emailRedirectTo: `${origin}/auth/callback` } });
      if (error) throw new ApiError(error.status === 429 ? 'Too many attempts. Please wait before trying again.' : 'Signup could not be completed. Check your details or try signing in.', error.status === 429 ? 429 : 400);
      return NextResponse.json(data.session ? { redirect: '/onboarding' } : { message: 'Check your email to confirm your account, then return here to sign in.' });
    }
    const { error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
    if (error) throw new ApiError('Unable to sign in. Check your email and password, and confirm your email address.', 401);
    return NextResponse.json({ redirect: '/dashboard' });
  } catch (error) { return apiError(error); }
}
