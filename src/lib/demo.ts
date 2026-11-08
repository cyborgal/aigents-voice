import type { Business, CallRecord } from './types';
export const demoBusiness: Business = {
  id: 'preview', officer_name: 'Alex Morgan', business_email: 'alex@example.com', company_name: 'Evergreen Home Loans', nmls_id: '123456', business_phone: '+12025550142', timezone: 'America/Los_Angeles', calling_days: [1,2,3,4,5], calling_start: '09:00', calling_end: '17:00', agent_name: 'Evergreen Assistant', activation_status: 'active', integration_mode: 'demo',
};
export function demoCalls(): CallRecord[] {
  const now = Date.now();
  return [
    { name: 'Jordan Ellis', status: 'completed', duration: 164, outcome: 'Follow-up requested', summary: 'DEMONSTRATION: Jordan is exploring a first home purchase and requested a follow-up with a loan officer. No real conversation took place.' },
    { name: 'Taylor Brooks', status: 'completed', duration: 218, outcome: 'Appointment booked', summary: 'DEMONSTRATION: Taylor discussed refinancing goals and a sample appointment. This is fictional preview data.' },
    { name: 'Casey Rivera', status: 'completed', duration: 96, outcome: 'Information provided', summary: 'DEMONSTRATION: Casey asked about the loan application process. The assistant offered a follow-up. No real conversation took place.' },
    { name: 'Morgan Lee', status: 'failed', duration: 0, outcome: 'No answer', summary: null },
    { name: 'Sam Parker', status: 'completed', duration: 187, outcome: 'Follow-up requested', summary: 'DEMONSTRATION: Sam requested more information about mortgage options. All information is fictional.' },
  ].map((v, i) => ({ id: `demo-${i}`, prospect_name: v.name, phone_masked: `••• ••• 01${40+i}`, direction: 'outbound', status: v.status, outcome: v.outcome, duration_seconds: v.duration, summary: v.summary, mode: 'demo', created_at: new Date(now - (i * 110 + 15) * 60000).toISOString() }));
}
