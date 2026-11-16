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

## Finalizing `rc-calls` (n8n operator checklist)

**Do not archive every recording in the RingCentral Call Log.** A call log can contain non-AIGents calls. The 180-second intent used to authorize an Answered event is not suitable for checking a disconnected call, because it may have expired. Add a per-session archive authorization marker **only after** `Recording - Start Recording` returns a successful recording response.

### 1. Write durable session authorization after on-demand recording succeeds

Use the same Upstash credential already configured for `Recording - Read Intent`. Write a Redis value with a stable exact telephony session key, for example:

- Key: `aigents:record:authorized:<telephonySessionId>`
- Value: JSON with `telephonySessionId`, `lo_number`, `borrower`, `lo_email`, `source`, `created_at`; optionally include `recordingId` from RingCentral's POST response
- TTL: 604800 seconds (seven days), long enough for delayed call-log processing and repair

Validate that the authorization data originates from the previous `Recording - Check Intent` success and matched full telephony session; do not use attacker-controlled webhook payload fields as authorization. For same-session duplicate processing, use `SET key value EX 604800 NX` and only accept `OK` or verify an existing value is the same session and workspace. Keep the old `aigents:record:claimed:<sessionId>` idempotency key for preventing multiple start-recording calls.

### 2. Gate the disconnected-call upload branch

After `Get Call Log`, before `Recording - Find Completed Recording`:

1. Read Redis `aigents:record:authorized:<telephonySessionId>`.
2. Parse JSON, require exact equality with current call-log `telephonySessionId`, expected LO number, and the verified workspace email; where present also require the recording ID.
3. Require the call-log parent record's recording `contentUri`, and match the session ID, not merely `records[0]`.
4. Only then download and upload to `call-recordings` and update the matching `calls` row.
5. If no marker exists, skip the archive path entirely. This includes manual/non-AIGents recordings.

Never use the newly-written 180-second number-pair intent for disconnect authorization; it could be unrelated to this completed call.

### 3. Handle recording finalization and dashboard-upsert timing

- RingCentral Call Log may be available before its `recording.contentUri`; retry the retrieval with bounded backoff and a clear failure path.
- The dashboard upsert and recording upload run on independent branches. The PATCH `calls?external_id=eq.<callLogId>` may return an empty list. Keep a bounded delayed retry (e.g. 2, 5, 10, 20, 30 seconds), checking the response has exactly one correct `user_id`, `external_id`, `recording_path`. A missing row must be reported, not silently considered success.
- Storage `x-upsert=true` supports retrying the same `extensionId/recordingId.mp3` path. Preserve idempotent semantics for duplicate webhook executions.
- Upload and playback failure must **not** interrupt billing, summary extraction, or existing email notifications.

### 4. Email recording availability

Prefer a link to the authenticated dashboard, **not** a five-minute signed audio URL in email (it expires before most recipients read it). Example:

`Recording: Available in AIGents Voice → Conversations: https://aigents-voice.vercel.app/dashboard?view=calls`

Only include this statement when the private upload and database update have succeeded; the existing notification subworkflow may run before this branch, so either synchronize after upload or use a separate non-sensitive recording-ready email. Do not send raw borrower audio by email as the default.

### 5. Production security

Verify permission/consent and legally required recording announcements for all participants and jurisdictions. Keep private bucket and encrypted service-role credential; do not put secrets, signed URLs, borrower phone numbers, or recordings in GitHub files. Rotate any previously exposed RingCentral subscription verification token. Audit access to recordings and establish deletion/retention policies. The present number-pair intent matcher can still collide with a simultaneous unrelated call to the same number during the short intent lifetime; use a stronger per-call correlation mechanism before scaling beyond the restricted beta.

### Rollout gate

The browser playback PR can be merged only after build/typecheck and manual owner-vs-other-user access tests. The n8n workflow must be separately saved, activated and verified using one new successful RingOut test; this repository cannot itself deploy an n8n workflow.
