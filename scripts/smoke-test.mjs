// Creates and removes one disposable account; runs only in demo mode.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

assert.equal(process.env.VOICE_MODE, 'demo', 'Smoke tests must never place live calls.');
const base = process.env.TEST_APP_URL || 'http://localhost:3000';
assert.ok(['http://localhost:3000', 'https://aigents-voice.vercel.app'].includes(base), 'Use only the local app or the verified production project.');
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const email = `smoke-${randomUUID()}@example.com`;
const password = `${randomUUID()}Aa9!`;
const jar = new Map();
let userId;
async function request(path, method = 'POST', body, expected = 200, origin = base) {
  const response = await fetch(`${base}${path}`, { method, headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: [...jar].map(([k,v]) => `${k}=${v}`).join('; ') }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'manual' });
  for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(';')[0]; const i = pair.indexOf('='); jar.set(pair.slice(0,i),pair.slice(i+1)); }
  const data = await response.json();
  assert.equal(response.status, expected, `${path}: ${response.status} ${data.error || ''}`);
  return data;
}
try {
  await request('/api/activate', 'POST', undefined, 401);
  await request('/api/activate', 'POST', undefined, 403, 'https://untrusted.example');
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Disposable Smoke Test' } });
  if (error) throw error;
  userId = data.user.id;
  await request('/api/auth', 'POST', { mode: 'login', email, password });
  const business = { officer_name: 'Disposable Smoke Test', business_email: email, company_name: 'AIGents QA — disposable', nmls_id: '123456', business_phone: '+12025550123', timezone: 'America/Los_Angeles', calling_days: [0,1,2,3,4,5,6], calling_start: '00:00', calling_end: '23:59', agent_name: 'QA Assistant' };
  const saved = await request('/api/onboarding', 'POST', business);
  assert.equal(saved.business.id,userId);
  assert.equal(saved.business.activation_status,'inactive');
  const activated = await request('/api/activate');
  assert.equal(activated.business.activation_status,'active');
  assert.equal(activated.business.integration_mode,'demo');
  const call = { phone: '+12025550123', consent: true, idempotencyKey: randomUUID() };
  const first = await request('/api/calls','POST',call);
  assert.equal(first.call.mode,'demo');
  assert.equal(first.call.status,'completed');
  const duplicate = await request('/api/calls','POST',call);
  assert.equal(duplicate.call.id,first.call.id);
  await request('/api/calls','POST',{...call,idempotencyKey:randomUUID()},429);
  const history = await request('/api/calls','GET');
  assert.equal(history.calls.length,1);
  assert.equal(history.calls[0].phone_masked.includes('+12025550123'),false);
  const settings = await request('/api/settings','PATCH',{...business,agent_name:'QA Updated'});
  assert.equal(settings.business.agent_name,'QA Updated');
  const sync = await request('/api/sync');
  assert.equal(sync.calls.length,1);
  await request('/api/logout');
  await request('/api/calls','GET',undefined,401);
  console.log('PASS: anonymous/CSRF protection, login, onboarding persistence, demo activation, simulated call, idempotency, rate limit, masked history, settings, sync, logout.');
} finally {
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error('Disposable test account cleanup failed.');
    console.log('Disposable test account and related data removed.');
  }
}
