# Voice integration contract

`src/lib/voice.ts` is the server-only boundary between AIGents Voice and the existing Grok/RingCentral/n8n/Upstash/Bonzo infrastructure. The app does not replace those services. The contract below is **provisional** until the existing workflow owners supply their real endpoint schemas. Adapt this module to those contracts; do not alter working voice infrastructure merely to match this document.

## Modes and configuration

`VOICE_MODE=demo` is the default. Demo activation and calling are local simulations: no telephone call, external registration, billed usage, or provider history is produced. The app must display demo labels and store simulated records with `mode=demo`.

`VOICE_MODE=live` requires all of these server-only variables:

```dotenv
VOICE_MODE=live
VOICE_API_TOKEN=
VOICE_ACTIVATE_URL=https://your-existing-service.example/activate
VOICE_CALL_URL=https://your-existing-service.example/call
VOICE_HISTORY_URL=https://your-existing-service.example/history
VOICE_SETTINGS_URL=https://your-existing-service.example/settings
```

URLs must use HTTPS and cannot contain embedded user/password credentials or fragments. Requests use POST JSON and `Authorization: Bearer <VOICE_API_TOKEN>`. Requests time out after 15 seconds, refuse redirects, and bypass caching. Responses are bounded to 1 MiB and validated strictly; history permits at most 500 unique call IDs. Invalid configuration and upstream failures never fall back to demo. Secrets and upstream response bodies are not included in user-facing errors or logs.

No integration requests are made until an application action calls the configured adapter. Live calling additionally requires server authorization, an approved test number, consent, calling-hour validation, active live registration, and atomic call reservation. The adapter is not a substitute for these route-level checks.

## Business payload

Activation, call, and settings requests include `business`:

```json
{
  "officerName": "Test Officer",
  "businessEmail": "officer@example.com",
  "companyName": "Example Lending",
  "nmlsId": "123456",
  "businessPhone": "+14155550123",
  "agentName": "AIGents Assistant",
  "timezone": "America/Los_Angeles",
  "callingDays": [1, 2, 3, 4, 5],
  "callingStart": "09:00",
  "callingEnd": "17:00"
}
```

The payload personalizes a shared underlying agent. No unsupported model, voice, or personality options are sent. `tenantId` is derived from the verified Supabase user ID. `clientId` is the confirmed external registration ID stored server-side. The upstream service must scope every action and response to this tenant/client pair; a shared bearer token alone does not establish tenant isolation.

## Activation

Request: `{ "tenantId": "<user UUID>", "business": { ... } }`.

Header: `Idempotency-Key: activate:<user UUID>`.

Response: `{ "active": true, "clientId": "<external registration ID>" }`.

Only `active: true` confirms activation. The provider must implement idempotent registration so retries cannot create duplicate clients. A false `active` response must still contain a registration ID, and must not mark the application agent active.

## Test call

Request: `{ "tenantId": "<user UUID>", "clientId": "<registration ID>", "phone": "+14155550123", "idempotencyKey": "<request UUID>", "business": { ... } }`.

Header: `Idempotency-Key: <request UUID>`.

Response: `{ "accepted": true, "externalId": "<provider call ID>", "status": "queued" }`.

An accepted call needs a nonempty external ID and cannot have failed/rejected status. Rejections may return `{ "accepted": false, "externalId": "", "status": "rejected" }`. Acceptance means the provider accepted the request; it does not prove the phone connected. The upstream service **must honor idempotency keys**, including after timeouts. A timeout is ambiguous: the phone may already be ringing. Preserve the reservation, mark the state unknown, and reconcile history before retrying. A new key must not be used to blindly retry an uncertain call.

## History, status, summaries, and usage

Request: `{ "tenantId": "<user UUID>", "clientId": "<registration ID>" }`.

Response:

```json
{
  "calls": [{
    "externalId": "provider-call-123",
    "prospectName": null,
    "phoneMasked": "••• ••• 0123",
    "status": "completed",
    "direction": "outbound",
    "durationSeconds": 92,
    "summary": "Borrower requested a follow-up during business hours.",
    "outcome": "Follow-up requested",
    "createdAt": "2026-11-08T19:00:00Z"
  }],
  "usage": { "minutes": 1.5333, "appointmentsBooked": null }
}
```

Every call field shown is required; nullable fields may be null. `durationSeconds` must be a nonnegative integer up to 86400. `summary` is limited to 20000 characters and `outcome` to 240. Only masked phone strings are accepted. Status values: `queued`, `ringing`, `in_progress`, `completed`, `failed`, `rejected`, `unknown`.

`usage` is optional. When supplied, it is a **cumulative account snapshot** for the tenant, not an incremental event to append repeatedly to `usage_events`. Missing metrics stay null. The initial UI may derive minutes from known call durations; do not infer booked appointments from missing data. The current adapter supports a maximum of 500 calls per sync with no pagination; adapt the contract when the real provider exposes cursors or date windows. Only return that tenant's calls, and omit confidential borrower financial details from summaries.

## Settings

Request: `{ "tenantId": "<user UUID>", "clientId": "<registration ID>", "business": { ... } }`.

Response: `{ "updated": true }`.

Treat malformed or unsuccessful responses as failed synchronization. Preserve a clear indication when settings have been saved locally but provider synchronization has not succeeded.

## Remaining external dependencies

The exact URLs, authentication mechanism, payload mapping, idempotency support, call status semantics, and account usage window must be verified against the existing infrastructure. Real-call verification requires those details and an explicitly authorized test destination. Demo tests validate application behavior, not carrier connectivity or real AI conversations.
