# Private call-recording playback

## Pipeline

RingCentral's on-demand recording is started from the `rc-calls` webhook after validating a short-lived AIGents recording intent. Once the call disconnects, n8n reads its Call Log `recording.contentUri`, downloads the MP3, uploads it to private Supabase Storage (`call-recordings`), and updates the matching `calls.recording_path` value. The database field contains a bucket-relative path, e.g. `<ringcentral-extension-id>/<recording-id>.mp3`; do not store signed URLs in the database.

## Dashboard

- `src/app/dashboard/page.tsx` selects `recording_path` under the authenticated user's call RLS.
- The Conversations details modal shows `RecordingPlayer` only for live calls with a nonempty recording path.
- On click, `GET /api/recordings/[callId]` authenticates the session, queries `calls` with both the requested call ID and authenticated `user_id`, and restricts to live-mode records.
- Only after authorization does the server-only Supabase admin client generate a 300-second signed URL from the private bucket.
- The browser receives only that temporary signed URL; Supabase secret keys and recording storage paths do not become public through the route.
- Unauthorized and missing recordings return no URL. The response uses `Cache-Control: no-store`. Clients can refresh a URL after expiration.

## Production checks

1. Keep the bucket private. Verify recording content is not reachable without a valid signed URL.
2. Log in as the appropriate workspace owner, open Conversations > a completed recorded call, and play the MP3.
3. Open a different account and verify that requesting the first account's call ID returns 404 and creates no signed URL.
4. Verify calls without `recording_path` show no Play Recording control. Demo calls never expose actual audio.
5. Verify signed playback URL expiry and Refresh playback link.
6. Rotate exposed RingCentral webhook token/JWT. Ensure privacy disclosures, recording consent, access auditing, retention and deletion policy before production.
7. n8n's recording-upload branch currently runs independently from dashboard call upsert. Add idempotent retry on missing row, and gate archival to AIGents-authorized session records to avoid copying non-AIGents recordings.
8. The n8n recording post-call email integration remains separate and is not implemented in this pull request.

## Database requirement

`calls.recording_path text null` must exist. It was manually created in the Supabase dashboard; this PR intentionally does not reapply schema changes.
