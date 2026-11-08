import { z } from 'zod';

export function normalizePhone(value: string) {
  const digits = value.replace(/[\s().-]/g, '');
  if (/^[0-9]{10}$/.test(digits)) return `+1${digits}`;
  return digits;
}
export const phoneSchema = z.string().transform(normalizePhone).pipe(z.string().regex(/^\+[1-9]\d{7,14}$/, 'Enter a phone number with country code, such as +14155550123.'));
export const businessSchema = z.object({
  officer_name: z.string().trim().min(2).max(120),
  business_email: z.email().max(254),
  company_name: z.string().trim().min(2).max(160),
  nmls_id: z.string().regex(/^\d{1,12}$/, 'NMLS ID must contain only digits.'),
  business_phone: phoneSchema,
  timezone: z.string().refine(v => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch { return false; } }, 'Choose a valid timezone.'),
  calling_days: z.array(z.number().int().min(0).max(6)).min(1).max(7).transform(v => [...new Set(v)]),
  calling_start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  calling_end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  agent_name: z.string().trim().min(2).max(80).default('AIGents Assistant'),
}).refine(v => v.calling_start < v.calling_end, { message: 'End time must be later than start time.', path: ['calling_end'] });
export const callSchema = z.object({ phone: phoneSchema, consent: z.literal(true), idempotencyKey: z.uuid() });
export function maskPhone(phone: string) { return `••• ••• ${phone.slice(-4)}`; }
export function isWithinCallingHours(business: { timezone: string; calling_days: number[]; calling_start: string; calling_end: string }, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: business.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)?.value || '';
  const day = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(part('weekday'));
  const time = `${part('hour')}:${part('minute')}`;
  return business.calling_days.includes(day) && time >= business.calling_start.slice(0,5) && time < business.calling_end.slice(0,5);
}
