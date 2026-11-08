export type IntegrationMode = 'demo' | 'live';
export interface Business {
  id: string;
  officer_name: string;
  business_email: string;
  company_name: string;
  nmls_id: string;
  business_phone: string;
  timezone: string;
  calling_days: number[];
  calling_start: string;
  calling_end: string;
  agent_name: string;
  activation_status: 'inactive' | 'pending' | 'active' | 'failed';
  external_client_id?: string | null;
  integration_mode: IntegrationMode;
}
export interface CallRecord {
  id: string;
  user_id?: string;
  external_id?: string | null;
  prospect_name: string | null;
  phone_masked: string;
  direction: 'inbound' | 'outbound';
  status: string;
  outcome: string | null;
  duration_seconds: number | null;
  billed_minutes?: number | null;
  bonzo_prospect_id?: string | null;
  summary: string | null;
  mode: IntegrationMode;
  created_at: string;
  idempotency_key?: string;
}
