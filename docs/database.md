# Supabase database setup

1. Create a Supabase project. In its SQL editor, run `supabase/migrations/202611080001_initial.sql` once. Alternatively link the project with the Supabase CLI and run `supabase db push`.
2. Configure the project URL and publishable (or legacy anon) key in the application's public Supabase environment variables. Configure the service-role key **only** in the server environment; never prefix it with `NEXT_PUBLIC_`.
3. In Supabase Authentication settings, configure the application's production Site URL and allowed authentication callback URL. Add the equivalent localhost callback while developing. Enable email/password authentication. Email confirmation can remain enabled; configure a suitable email delivery service for production.
4. Start the app, sign up, follow the confirmation email when required, and complete onboarding.

The service-role key bypasses RLS. Every server mutation must first validate the user's session using Supabase Auth and derive the owner UUID from that verified identity, never from an incoming request body. The schema deliberately gives authenticated browser sessions read-only access to their own rows. Anonymous sessions cannot read application tables.

## Data contract

- `profiles`: `id` is the Supabase user UUID. `email`, `full_name`, `created_at`, `updated_at`. A database trigger creates a profile for every new account; existing accounts are backfilled by the migration.
- `businesses`: `id` is also the user UUID. `officer_name`, `business_email`, `company_name`, `nmls_id`, `business_phone` (E.164), `timezone` (IANA), `calling_days` (integers, Sunday = 0), `calling_start`, `calling_end` (local times), `agent_name`, `activation_status`, `external_client_id`, `integration_mode`, timestamps. Business hours must finish after they start; overnight windows are not supported in this MVP.
- `calls`: UUID `id`, owner `user_id`, provider `external_id`, nullable `prospect_name`, `phone_masked`, `direction`, `status`, nullable `outcome`, nullable `duration_seconds`, nullable `summary`, nullable `transcript` JSON, nullable `recording_url`, `mode`, unique UUID `idempotency_key`, timestamps. Raw destination numbers are not persisted in call records. Optional transcript and recording columns reserve room for later integrations; storing them is not required.
- `usage_events`: UUID `id`, owner `user_id`, optional `call_id`, optional provider `external_event_id`, nullable `minutes`, nullable `appointments_booked`, `mode`, `occurred_at`, `created_at`. Events represent incremental provider usage, not cumulative snapshots. Keep unavailable values null. Deduplicate using `(user_id, external_event_id, mode)` when the provider supplies event IDs. Server code must verify a referenced call belongs to the same user before inserting usage.

Allowed activation statuses: `inactive`, `pending`, `active`, `failed`. Allowed call statuses: `queued`, `ringing`, `in_progress`, `completed`, `failed`, `rejected`, `unknown`. Modes are `demo` and `live`; always filter and label them explicitly in the interface.

## Atomic test-call reservation

Call `reserve_test_call` with a server-side service-role client:

```ts
const { data, error } = await admin.rpc('reserve_test_call', {
  p_user_id: verifiedUser.id,
  p_idempotency_key: requestId,
  p_phone_masked: '••• ••• 1234',
  p_mode: 'live',
});
// data is an array containing one calls row.
```

The function locks per user inside the transaction and enforces a 60-second cooldown and 10 reservations per UTC calendar day, across demo and live modes. Rejected or failed attempts still consume the allowance. Reusing an idempotency key for the same request returns the original row. Conflicting user, mode, or masked-phone values are rejected. Forward the same idempotency key to the voice provider; database reservation alone cannot make an external HTTP side effect exactly-once. Do not blindly re-dispatch an existing queued call after a timeout. Mark uncertain results `unknown` and reconcile with the provider.

This function does not authorize a destination number, confirm consent, enforce business hours, or check agent activation. The authenticated server route must perform those checks **before** reserving or dispatching a call. Only server-approved test destinations may be called.

## Verification before production

On November 8, 2026, transactional SQL checks passed against the configured Supabase project after the migration was applied. Two synthetic users and their business, call, and usage rows were created inside a transaction and rolled back. A subsequent query confirmed zero residual test users. No schema changes were made during verification.

Verified database behavior:

- Each authenticated role/subject could read exactly its own profile, business, call, and usage row; explicit cross-tenant queries returned no rows.
- Authenticated direct activation updates, call inserts, and reservation RPC calls were denied.
- Anonymous business reads and reservation RPC calls were denied.
- The service role could reserve a queued test call; repeating its key returned the same call ID.
- Reusing a key with a conflicting mode was rejected.
- A second reservation inside 60 seconds was rejected.
- Ten reservations within the UTC day prevented an eleventh, including across demo/live modes.

`tests/validation.test.ts` also passes 10 checks covering phone normalization and rejection, explicit consent, UUID validation, business field validation, calling-day normalization, opening/closing boundaries, local weekdays, database time strings, and both daylight-saving transitions. Run with `node --import tsx --test tests/validation.test.ts`.

These checks validate database authorization and sequential limit behavior. The advisory transaction lock provides serialization, but a separate multi-connection race test has not been run. Browser signup/session flow and server-route checks still require application verification: confirm unauthenticated API requests return 401, forbidden destinations fail without dispatch, and real provider calls remain scoped to the verified tenant.
