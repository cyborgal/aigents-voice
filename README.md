# AIGents Voice

A self-service voice command center for mortgage loan officers. Built with Next.js App Router, TypeScript, Tailwind CSS, and Supabase Auth/Postgres. Existing Grok, RingCentral, n8n, Redis, and Bonzo infrastructure stays behind authenticated HTTP adapters.

Live app: https://aigents-voice.vercel.app · Interactive preview: https://aigents-voice.vercel.app/demo

## Current status

Implemented: signup/login/email callback/logout, session refresh, tenant-isolated database, saved onboarding, activation state machine, guarded test-call API, call history and detail summaries, business settings, responsive dashboard, and interactive demo preview.

New workspaces use explicitly labeled `demo` activation and calls. Paige Bui’s provisioned beta workspace uses the live n8n test-call webhook, restricted to the approved test number and configured calling hours. Existing n8n workflows write Bonzo leads and RingCentral call completions to Supabase. `/demo` remains a fictional preview. No billing, transcript retrieval, or recording retrieval is enabled.

The Bonzo Leads page has a **Call Lead** action for an eligible approved test-number row. It sends only the lead UUID to the authenticated server route, which verifies workspace ownership, DNC, and the saved Bonzo ID and phone. The route is prepared to send the server-resolved Bonzo prospect ID to n8n. `CRM_LEAD_CALLS_VERIFIED` defaults to false and blocks CRM-linked dispatch until n8n independently verifies Bonzo ownership, phone, and DNC and the project owner confirms it is ready. Standalone Test Call remains live for the approved number.

## Local setup

Use Node 22.13+ (Node 24 recommended) and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Explore http://localhost:3000/demo without an account.

Set these environment variables:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Canonical application origin; `http://localhost:3000` locally |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public Supabase key; RLS protects account data |
| `SUPABASE_SECRET_KEY` | Server-only Supabase secret or legacy service-role key |
| `VOICE_MODE` | `demo` by default; `live` requires all endpoints below |
| `VOICE_API_TOKEN` | Server-only bearer token for existing voice backend |
| `VOICE_ACTIVATE_URL` | HTTPS client registration and activation endpoint |
| `VOICE_CALL_URL` | HTTPS outbound test-call initiation endpoint |
| `VOICE_HISTORY_URL` | HTTPS tenant-scoped history/summary/usage endpoint |
| `VOICE_SETTINGS_URL` | HTTPS client preferences update endpoint |
| `VOICE_TEST_ALLOWLIST` | Comma-separated approved E.164 test numbers; required for live calls |

Never commit `.env.local`, Supabase secret keys, voice tokens, or borrower data. `.env.example` contains names only.

## Supabase

Apply `supabase/migrations/202611080001_initial.sql` to a new project. The challenge project already has this migration applied. See [database design and verification](docs/database.md).

In Supabase Authentication URL Configuration:

- Set Site URL to the deployed app origin.
- Allow `http://localhost:3000/auth/callback` and the deployed origin's `/auth/callback`.
- Keep email confirmation enabled. Configure SMTP for reliable delivery and external signups; Supabase's default email service has restrictions.

One authenticated user owns one business in this MVP. All tables have SELECT-own RLS. Browser roles cannot mutate protected business state or call records. The server validates the user with `getUser`, validates request bodies, checks origin, and derives tenant identity from the session before using the server secret key.

## Voice integration

See [provisional request/response contracts](docs/integrations.md). They are an adapter boundary, not a claim about the current n8n endpoints. Modify `src/lib/voice.ts` to map the real contract once supplied.

- Agent becomes active only after a validated positive activation response.
- Calls require an authenticated account, active agent in the current mode, explicit recipient permission, and valid phone number.
- Live calls also require a server allowlisted number and the account's configured calling window.
- An atomic database reservation limits each account to one test call per 60 seconds and ten per UTC day.
- Idempotency prevents duplicate dispatch. Unknown initiation outcomes are not automatically retried.
- Only masked destinations are saved. Raw numbers are passed server-to-server to the voice backend.
- Leads and call history are read from Supabase, where the existing n8n workflows write them. Refresh reloads the latest records. Initiation and RingCentral completion may have different IDs and are displayed separately.
- Dashboard values derive from the latest 200 records. Usage snapshots are accepted by the adapter; durable provider billing totals and appointment aggregates remain to be integrated. Missing outcomes are not fabricated.

## Deployment

Vercel project: `aigents1/aigents-voice`. Use the Next.js preset; `vercel.json` invokes `npm run build` with Webpack (avoids a local Windows Turbopack worker failure).

```sh
npx vercel login
npx vercel link --project aigents-voice
npx vercel deploy --prod --yes
```

Set production environment values in Vercel, including the server-only Supabase secret. Use the actual deployment origin for `NEXT_PUBLIC_APP_URL`, then configure Supabase Auth redirects. Redeploy after environment changes. `scripts/configure-vercel.mjs` copies the four core local variables to the linked production environment through stdin without displaying secrets; run it only for your intended project.

The GitHub plugin and local Git credentials are separate. Git pushes use Git Credential Manager. Vercel's GitHub auto-deploy requires a separate GitHub Login Connection in Vercel; direct CLI deployment works without it.

## Validation

```sh
npm test
npm run typecheck
npm run build
# With local dev server running and VOICE_MODE=demo:
node --env-file=.env.local scripts/smoke-test.mjs
```

18 unit tests cover validation, calling windows/DST, consent, provider contracts, tenant identity, safe error handling, and demo/live separation. Database transaction tests verified RLS, denied browser writes, idempotency, cooldown and daily caps with rollback. The authenticated smoke test passed both locally and against the production URL. It creates and removes a disposable account and verifies login, onboarding, activation, a simulated call, history, settings, sync, CSRF/anonymous rejection, rate limiting, and logout.

Email delivery/confirmation and real outbound calling still require live verification. Browser visual QA was interrupted by the local computer-use environment; production compilation and HTTP/API tests are independent of that limitation.

