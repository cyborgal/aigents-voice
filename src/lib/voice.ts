import 'server-only';
import { z } from 'zod';
import type { Business, IntegrationMode } from './types';

const callStatus = z.enum(['queued', 'ringing', 'in_progress', 'completed', 'failed', 'rejected', 'unknown']);
const providerCallSchema = z.object({
  externalId: z.string().min(1).max(200),
  prospectName: z.string().max(160).nullable(),
  phoneMasked: z.string().min(4).max(40).refine(value => !/\d{7}/.test(value.replace(/[\s()+.-]/g, '')), 'Phone must be masked'),
  status: callStatus,
  direction: z.enum(['inbound', 'outbound']),
  durationSeconds: z.number().int().min(0).max(86400).nullable(),
  summary: z.string().max(20000).nullable(),
  outcome: z.string().max(240).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
}).strict();
const activationSchema = z.object({ active: z.boolean(), clientId: z.string().min(1).max(200) }).strict();
const startCallSchema = z.object({
  accepted: z.boolean(), externalId: z.string().max(200), status: callStatus,
}).strict().refine(value => !value.accepted || (value.externalId.length > 0 && !['failed', 'rejected'].includes(value.status)), 'Inconsistent call acceptance');
const syncSchema = z.object({
  calls: z.array(providerCallSchema).max(500),
  usage: z.object({
    minutes: z.number().finite().min(0).nullable(),
    appointmentsBooked: z.number().int().min(0).nullable(),
  }).strict().optional(),
}).strict().refine(value => new Set(value.calls.map(call => call.externalId)).size === value.calls.length, 'Duplicate provider call IDs');
const settingsSchema = z.object({ updated: z.literal(true) }).strict();

export type ProviderCall = z.infer<typeof providerCallSchema>;
export interface VoiceAdapter {
  activate(business: Business): Promise<{ active: boolean; clientId: string }>;
  startCall(business: Business, phone: string, idempotencyKey: string): Promise<{ accepted: boolean; externalId: string; status: string }>;
  sync(business: Business): Promise<{ calls: ProviderCall[]; usage?: { minutes: number | null; appointmentsBooked: number | null } }>;
  updateSettings(business: Business): Promise<void>;
}

export class VoiceIntegrationError extends Error {
  constructor(public readonly code: 'CONFIGURATION' | 'UNAVAILABLE' | 'INVALID_RESPONSE') {
    super(code === 'CONFIGURATION'
      ? 'Voice integration is not configured. Contact your administrator.'
      : code === 'INVALID_RESPONSE'
        ? 'The voice service returned an unexpected response. Please contact support.'
        : 'The voice service could not confirm this request. Check activity before trying again.');
    this.name = 'VoiceIntegrationError';
  }
}

export function integrationMode(): IntegrationMode {
  const mode = process.env.VOICE_MODE ?? 'demo';
  if (mode !== 'demo' && mode !== 'live') throw new VoiceIntegrationError('CONFIGURATION');
  return mode;
}

function businessPayload(business: Business) {
  return {
    officerName: business.officer_name,
    businessEmail: business.business_email,
    companyName: business.company_name,
    nmlsId: business.nmls_id,
    businessPhone: business.business_phone,
    agentName: business.agent_name,
    timezone: business.timezone,
    callingDays: business.calling_days,
    callingStart: business.calling_start.slice(0, 5),
    callingEnd: business.calling_end.slice(0, 5),
  };
}

type Endpoint = 'activate' | 'call' | 'history' | 'settings';
type LiveConfig = { token: string; urls: Record<Endpoint, string> };
function liveConfig(): LiveConfig {
  const token = process.env.VOICE_API_TOKEN;
  if (!token?.trim()) throw new VoiceIntegrationError('CONFIGURATION');
  const urls = {} as Record<Endpoint, string>;
  for (const endpoint of ['activate', 'call', 'history', 'settings'] as const) {
    const raw = process.env[`VOICE_${endpoint.toUpperCase()}_URL`];
    try {
      const url = new URL(raw || '');
      if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error();
      urls[endpoint] = url.toString();
    } catch { throw new VoiceIntegrationError('CONFIGURATION'); }
  }
  return { token, urls };
}

// Keep upstream bodies out of logs/errors and bound the response before JSON parsing.
async function readBoundedJson(response: Response): Promise<unknown> {
  const maxBytes = 1024 * 1024;
  if (Number(response.headers.get('content-length')) > maxBytes || !response.body) throw new VoiceIntegrationError('INVALID_RESPONSE');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new VoiceIntegrationError('INVALID_RESPONSE');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof VoiceIntegrationError) throw error;
    throw new VoiceIntegrationError('INVALID_RESPONSE');
  } finally { reader.releaseLock(); }
}

function createLiveAdapter(config: LiveConfig): VoiceAdapter {
  async function post<T>(endpoint: Endpoint, payload: unknown, schema: z.ZodType<T>, idempotencyKey?: string): Promise<T> {
    try {
      const response = await fetch(config.urls[endpoint], {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${config.token}`,
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
        cache: 'no-store',
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new VoiceIntegrationError('UNAVAILABLE');
      }
      const result = schema.safeParse(await readBoundedJson(response));
      if (!result.success) throw new VoiceIntegrationError('INVALID_RESPONSE');
      return result.data;
    } catch (error) {
      if (error instanceof VoiceIntegrationError) throw error;
      throw new VoiceIntegrationError('UNAVAILABLE');
    }
  }
  function identity(business: Business) {
    if (!business.external_client_id || business.integration_mode !== 'live') throw new VoiceIntegrationError('CONFIGURATION');
    return { tenantId: business.id, clientId: business.external_client_id };
  }
  return {
    activate: business => post('activate', { tenantId: business.id, business: businessPayload(business) }, activationSchema, `activate:${business.id}`),
    startCall: (business, phone, idempotencyKey) => post('call', {
      ...identity(business), phone, idempotencyKey, business: businessPayload(business),
    }, startCallSchema, idempotencyKey),
    sync: business => post('history', identity(business), syncSchema),
    async updateSettings(business) {
      await post('settings', { ...identity(business), business: businessPayload(business) }, settingsSchema);
    },
  };
}

const demoAdapter: VoiceAdapter = {
  async activate(business) { return { active: true, clientId: `demo_${business.id}` }; },
  async startCall(_business, _phone, idempotencyKey) {
    return { accepted: true, externalId: `demo_${idempotencyKey}`, status: 'completed' };
  },
  async sync() { return { calls: [] }; },
  async updateSettings() { /* Simulation only: settings persistence belongs to the app. */ },
};

export function voiceAdapter(): VoiceAdapter {
  return integrationMode() === 'demo' ? demoAdapter : createLiveAdapter(liveConfig());
}
