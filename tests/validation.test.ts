import { test } from 'node:test';
import assert from 'node:assert/strict';
import { businessSchema, callSchema, isWithinCallingHours, maskPhone, normalizePhone, phoneSchema } from '../src/lib/validation';

const business = {
  officer_name: 'Test Officer', business_email: 'officer@example.com', company_name: 'Example Lending',
  nmls_id: '1234', business_phone: '+14155550123', timezone: 'America/Los_Angeles',
  calling_days: [1, 2, 3, 4, 5], calling_start: '09:00', calling_end: '17:00',
  agent_name: 'AIGents Assistant',
};

test('phone normalization accepts formatted US and explicit international numbers', () => {
  assert.equal(normalizePhone('(415) 555-0123'), '+14155550123');
  assert.equal(phoneSchema.parse(' +44 20 7946 0123 '), '+442079460123');
  assert.equal(phoneSchema.parse('+1 (415) 555-0123'), '+14155550123');
});

test('phone validation rejects extensions, alphabetic input, missing country codes, and oversized numbers', () => {
  for (const phone of ['5550123', '+0123456789', '+14155550123 ext 2', '+1234567890123456', 'call-me', '14155550123']) {
    assert.equal(phoneSchema.safeParse(phone).success, false, phone);
  }
  assert.equal(maskPhone('+14155550123'), '••• ••• 0123');
});

test('call requests require explicit consent and a valid idempotency UUID', () => {
  const call = { phone: '(415) 555-0123', consent: true, idempotencyKey: 'b9ce834d-a0f1-448c-beb7-677327993205' };
  assert.equal(callSchema.parse(call).phone, '+14155550123');
  assert.equal(callSchema.safeParse({ ...call, consent: false }).success, false);
  assert.equal(callSchema.safeParse({ ...call, consent: undefined }).success, false);
  assert.equal(callSchema.safeParse({ ...call, idempotencyKey: 'retry' }).success, false);
});

test('onboarding validates licensing, timezone, and ordered business hours', () => {
  assert.equal(businessSchema.safeParse(business).success, true);
  for (const patch of [
    { nmls_id: 'NMLS1234' }, { timezone: 'Not/AZone' }, { calling_start: '17:00' },
    { calling_start: '22:00', calling_end: '06:00' }, { calling_end: '24:00' },
    { calling_days: [] }, { calling_days: [7] }, { business_email: 'invalid' },
  ]) assert.equal(businessSchema.safeParse({ ...business, ...patch }).success, false, JSON.stringify(patch));
});

test('onboarding removes duplicate calling days and trims business names', () => {
  const result = businessSchema.parse({ ...business, calling_days: [1, 1, 3], company_name: ' Example Lending ' });
  assert.deepEqual(result.calling_days, [1, 3]);
  assert.equal(result.company_name, 'Example Lending');
});

test('business hours include opening and exclude closing in the selected timezone', () => {
  // Monday, November 9, 2026, Pacific Standard Time (UTC-8).
  assert.equal(isWithinCallingHours(business, new Date('2026-11-09T16:59:00Z')), false);
  assert.equal(isWithinCallingHours(business, new Date('2026-11-09T17:00:00Z')), true);
  assert.equal(isWithinCallingHours(business, new Date('2026-11-10T00:59:00Z')), true);
  assert.equal(isWithinCallingHours(business, new Date('2026-11-10T01:00:00Z')), false);
});

test('weekend exclusions use the business local weekday', () => {
  assert.equal(isWithinCallingHours(business, new Date('2026-11-08T18:00:00Z')), false);
  const tokyo = { ...business, timezone: 'Asia/Tokyo', calling_days: [2] };
  assert.equal(isWithinCallingHours(tokyo, new Date('2026-11-09T23:00:00Z')), false); // Tuesday 08:00.
  assert.equal(isWithinCallingHours(tokyo, new Date('2026-11-10T00:00:00Z')), true); // Tuesday 09:00.
});

test('database time strings with seconds are accepted when checking calling windows', () => {
  assert.equal(isWithinCallingHours({ ...business, calling_start: '09:00:00', calling_end: '17:00:00' }, new Date('2026-11-09T17:00:00Z')), true);
});

test('spring daylight saving transition follows local clock time', () => {
  const sunday = { ...business, calling_days: [0], calling_start: '02:00', calling_end: '04:00' };
  assert.equal(isWithinCallingHours(sunday, new Date('2026-03-08T09:59:00Z')), false); // 01:59 PST.
  assert.equal(isWithinCallingHours(sunday, new Date('2026-03-08T10:00:00Z')), true); // 03:00 PDT.
});

test('fall daylight saving repeated hour obeys the same local window', () => {
  const sunday = { ...business, calling_days: [0], calling_start: '01:00', calling_end: '02:00' };
  assert.equal(isWithinCallingHours(sunday, new Date('2026-11-01T08:30:00Z')), true); // 01:30 PDT.
  assert.equal(isWithinCallingHours(sunday, new Date('2026-11-01T09:30:00Z')), true); // 01:30 PST.
  assert.equal(isWithinCallingHours(sunday, new Date('2026-11-01T10:00:00Z')), false); // 02:00 PST.
});
