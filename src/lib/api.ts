import 'server-only';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServer, isSupabaseConfigured } from './supabase/server';

export class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function requireSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  const allowed = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin : new URL(request.url).origin;
  if (!origin || origin !== allowed) throw new ApiError('Request origin is not allowed.', 403);
}
export async function requireUser() {
  if (!isSupabaseConfigured()) throw new ApiError('Account services are not configured yet. Try the clearly labeled demo preview.', 503);
  const supabase = await createSupabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new ApiError('Please sign in to continue.', 401);
  return { user, supabase };
}
export async function readBody(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 16384) throw new ApiError('Request is too large.', 413);
  const text = await request.text();
  if (text.length > 16384) throw new ApiError('Request is too large.', 413);
  try { return JSON.parse(text); } catch { throw new ApiError('Send a valid JSON request.'); }
}
export function apiError(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(' ') }, { status: 400 });
  if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
  // Never return upstream bodies, secrets, or borrower data to the browser/logs.
  console.error('Application request failed:', error instanceof Error ? error.name : 'Unknown error');
  return NextResponse.json({ error: 'This request could not be completed. Check your service configuration and try again.' }, { status: 500 });
}
