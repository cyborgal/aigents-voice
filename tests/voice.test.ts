import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { integrationMode, voiceAdapter, VoiceIntegrationError } from '../src/lib/voice';
import type { Business } from '../src/lib/types';

const originalFetch = globalThis.fetch;
const variables = ['VOICE_MODE', 'VOICE_API_TOKEN', 'VOICE_ACTIVATE_URL', 'VOICE_CALL_URL', 'VOICE_HISTORY_URL', 'VOICE_SETTINGS_URL'];
const originalEnv = Object.fromEntries(variables.map(key => [key, process.env[key]]));
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of variables) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});
const business: Business = {
  id: '3cb906d1-98f7-4fe1-99b3-7fa48c9fa361',
  officer_name: 'Test Officer', business_email: 'officer@example.com', company_name: 'Example Lending',
  nmls_id: '1234', business_phone: '+14155550123', timezone: 'America/Los_Angeles',
  calling_days: [1, 2, 3, 4, 5], calling_start: '09:00:00', calling_end: '17:00:00',
  agent_name: 'AIGents Assistant', activation_status: 'active', external_client_id: 'client-1', integration_mode: 'live',
};
function configureLive() {
  process.env.VOICE_MODE = 'live';
  process.env.VOICE_API_TOKEN = 'test-only-secret';
  for (const endpoint of ['ACTIVATE', 'CALL', 'HISTORY', 'SETTINGS']) process.env[`VOICE_${endpoint}_URL`] = `https://voice.example/${endpoint.toLowerCase()}`;
}

test('demo mode never makes an external call and labels IDs as simulated', async () => {
  delete process.env.VOICE_MODE;
  globalThis.fetch = async () => { throw new Error('Unexpected network request'); };
  assert.equal(integrationMode(), 'demo');
  const adapter = voiceAdapter();
  assert.match((await adapter.activate(business)).clientId, /^demo_/);
  assert.deepEqual(await adapter.startCall(business, '+14155550123', 'request-1'), {
    accepted: true, externalId: 'demo_request-1', status: 'completed',
  });
  assert.deepEqual(await adapter.sync(business), { calls: [] });
});

test('invalid mode and insecure or missing configuration fail closed', () => {
  process.env.VOICE_MODE = 'production';
  assert.throws(() => voiceAdapter(), VoiceIntegrationError);
  configureLive();
  process.env.VOICE_CALL_URL = 'http://voice.example/call';
  assert.throws(() => voiceAdapter(), VoiceIntegrationError);
  configureLive();
  delete process.env.VOICE_API_TOKEN;
  assert.throws(() => voiceAdapter(), VoiceIntegrationError);
});

test('live call carries tenant, personalized business, and idempotency with safe fetch settings', async () => {
  configureLive();
  globalThis.fetch = async (input, init) => {
    assert.equal(input, 'https://voice.example/call');
    assert.equal(init?.method, 'POST');
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.cache, 'no-store');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('authorization'), 'Bearer test-only-secret');
    assert.equal(headers.get('idempotency-key'), 'request-2');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.tenantId, business.id);
    assert.equal(body.clientId, 'client-1');
    assert.equal(body.business.callingStart, '09:00');
    assert.equal(body.phone, '+14155550123');
    assert.equal(body.idempotencyKey, 'request-2');
    assert.ok(init?.signal);
    return Response.json({ accepted: true, externalId: 'provider-1', status: 'queued' });
  };
  assert.equal((await voiceAdapter().startCall(business, '+14155550123', 'request-2')).externalId, 'provider-1');
});

test('malformed success cannot activate an agent', async () => {
  configureLive();
  globalThis.fetch = async () => Response.json({ active: 'true', clientId: 'client-1' });
  await assert.rejects(voiceAdapter().activate(business), (error: unknown) => error instanceof VoiceIntegrationError && error.code === 'INVALID_RESPONSE');
});

test('upstream error bodies and credentials never appear in errors', async () => {
  configureLive();
  globalThis.fetch = async () => new Response('Borrower SSN and test-only-secret', { status: 500 });
  await assert.rejects(voiceAdapter().activate(business), (error: unknown) => {
    assert.ok(error instanceof VoiceIntegrationError);
    assert.equal(error.code, 'UNAVAILABLE');
    assert.doesNotMatch(error.message, /SSN|test-only-secret/);
    return true;
  });
});

test('history rejects raw numbers, unknown statuses, and duplicate provider IDs', async () => {
  configureLive();
  const call = {
    externalId: 'call-1', prospectName: null, phoneMasked: '••• ••• 0123', status: 'completed',
    direction: 'outbound', durationSeconds: 60, summary: null, outcome: null, createdAt: '2026-11-08T19:00:00Z',
  };
  for (const calls of [[{ ...call, phoneMasked: '+14155550123' }], [{ ...call, status: 'mystery' }], [call, call]]) {
    globalThis.fetch = async () => Response.json({ calls });
    await assert.rejects(voiceAdapter().sync(business), VoiceIntegrationError);
  }
  globalThis.fetch = async () => Response.json({ calls: [call], usage: { minutes: 1, appointmentsBooked: null } });
  const result = await voiceAdapter().sync(business);
  assert.equal(result.calls.length, 1);
  assert.equal(result.usage?.appointmentsBooked, null);
});

test('live actions refuse demo registrations', async () => {
  configureLive();
  globalThis.fetch = async () => { throw new Error('Should not dispatch'); };
  assert.throws(() => voiceAdapter().startCall({ ...business, integration_mode: 'demo' }, '+14155550123', 'request-3'), VoiceIntegrationError);
});

test('oversized responses are rejected before processing', async () => {
  configureLive();
  globalThis.fetch = async () => new Response('{}', { headers: { 'Content-Length': '1048577' } });
  await assert.rejects(voiceAdapter().activate(business), VoiceIntegrationError);
});
