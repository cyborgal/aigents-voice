import { NextResponse } from 'next/server';
import { apiError, requireSameOrigin } from '@/lib/api';
import { createSupabaseServer } from '@/lib/supabase/server';
export async function POST(request: Request) {
  try { requireSameOrigin(request); const client = await createSupabaseServer(); await client.auth.signOut(); return NextResponse.json({ redirect: '/login' }); }
  catch (error) { return apiError(error); }
}
