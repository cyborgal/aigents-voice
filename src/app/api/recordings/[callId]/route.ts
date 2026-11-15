import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api';
import { createAdmin } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ callId: string }> }) {
  try {
    const { user, supabase } = await requireUser();
    const { callId } = await context.params;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(callId)) {
      return NextResponse.json({ error: 'Recording not found.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }

    // Verify call ownership using the logged-in user's RLS-scoped client.
    const { data: call, error } = await supabase
      .from('calls')
      .select('id,recording_path,mode')
      .eq('id', callId)
      .eq('user_id', user.id)
      .eq('mode', 'live')
      .maybeSingle();

    if (error) throw error;
    if (!call?.recording_path || typeof call.recording_path !== 'string') {
      return NextResponse.json({ error: 'Recording not found.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }

    // Storage paths are written by our n8n backend, never supplied by the caller.
    // Fail closed on unexpected paths rather than generating a signed URL.
    if (!/^\d+\/\d+\.mp3$/.test(call.recording_path)) {
      return NextResponse.json({ error: 'Recording unavailable.' }, { status: 422, headers: { 'Cache-Control': 'no-store' } });
    }

    // Service role is server-only and used only AFTER verifying ownership.
    const { data, error: storageError } = await createAdmin()
      .storage
      .from('call-recordings')
      .createSignedUrl(call.recording_path, 300);

    if (storageError || !data?.signedUrl) {
      throw storageError || new Error('Signed recording URL missing');
    }

    return NextResponse.json({ url: data.signedUrl, expiresIn: 300 }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    // Never expose internal storage paths, tokens or service-role errors.
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Sign in to play recordings.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ error: 'Unable to load recording.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
