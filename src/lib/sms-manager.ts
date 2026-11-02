/**
 * SMS Manager — intercepts outbound SMS requests, returns simulated responses,
 * logs events to Firestore, and forwards notifications to Telegram asynchronously.
 *
 * When simulation mode is enabled, actual FCM dispatch is bypassed so no real
 * network SMS is ever transmitted during testing.
 */

import { getFirestore } from './firebase-admin';
import { sendTelegramNotification } from './telegram';
import type { SmsEvent, SmsManagerConfig, SmsSimulatedResponse } from '@/types';

// Use globalThis.crypto.randomUUID() which is available in Node 19+ and all modern runtimes.
// Falls back to a timestamp-based id for older environments.
function newId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const SMS_EVENTS_COLLECTION = 'smsManagerEvents';
const SMS_CONFIG_DOC = 'smsManagerConfig';
const SMS_CONFIG_COLLECTION = 'appConfig';

// ─── Default Config ────────────────────────────────────────────────────────

const DEFAULT_CONFIG: SmsManagerConfig = {
  enabled: false,
  blockActualSend: true,
  defaultResponse: {
    success: true,
    messageId: '',
    status: 'sent',
    deliveryDelayMs: 100,
  },
  phoneOverrides: {},
  telegramEnabled: false,
  notifyOnCapture: true,
};

let configCache: SmsManagerConfig | null = null;
let configCacheExpiry = 0;
const CONFIG_TTL_MS = 30_000; // re-read config every 30 s

// ─── Config I/O ────────────────────────────────────────────────────────────

export async function getSmsManagerConfig(): Promise<SmsManagerConfig> {
  if (configCache && Date.now() < configCacheExpiry) return configCache;

  try {
    const db = getFirestore();
    const snap = await db.collection(SMS_CONFIG_COLLECTION).doc(SMS_CONFIG_DOC).get();
    if (snap.exists) {
      configCache = { ...DEFAULT_CONFIG, ...(snap.data() as Partial<SmsManagerConfig>) };
    } else {
      configCache = { ...DEFAULT_CONFIG };
    }
  } catch {
    configCache = { ...DEFAULT_CONFIG };
  }

  configCacheExpiry = Date.now() + CONFIG_TTL_MS;
  return configCache!;
}

export async function updateSmsManagerConfig(
  patch: Partial<SmsManagerConfig>
): Promise<SmsManagerConfig> {
  const db = getFirestore();
  const ref = db.collection(SMS_CONFIG_COLLECTION).doc(SMS_CONFIG_DOC);

  const current = await getSmsManagerConfig();
  const next: SmsManagerConfig = { ...current, ...patch };

  await ref.set(next, { merge: true });

  configCache = next;
  configCacheExpiry = Date.now() + CONFIG_TTL_MS;
  return next;
}

export function invalidateSmsManagerConfigCache(): void {
  configCache = null;
  configCacheExpiry = 0;
}

// ─── Simulation Response Builder ────────────────────────────────────────────

function buildSimulatedResponse(
  config: SmsManagerConfig,
  to: string
): SmsSimulatedResponse {
  const override = config.phoneOverrides[to];
  const base = override ?? config.defaultResponse;
  return {
    ...base,
    messageId: base.messageId || `sim-${newId()}`,
  };
}

// ─── Core: capture & process SMS event ─────────────────────────────────────

export interface CaptureInput {
  to: string;
  body: string;
  messageId?: string;
  campaignId?: string;
  deviceId?: string;
}

export interface CaptureResult {
  event: SmsEvent;
  simulatedResponse: SmsSimulatedResponse | null;
  blocked: boolean;
}

export async function captureSmsEvent(input: CaptureInput): Promise<CaptureResult> {
  const config = await getSmsManagerConfig();
  const now = new Date().toISOString();
  const eventId = `smsevt-${newId()}`;

  const simResponse = config.enabled ? buildSimulatedResponse(config, input.to) : null;

  const event: SmsEvent = {
    id: eventId,
    to: input.to,
    body: input.body,
    timestamp: now,
    messageId: input.messageId,
    campaignId: input.campaignId,
    deviceId: input.deviceId,
    status: config.enabled
      ? config.blockActualSend
        ? 'blocked'
        : 'simulated'
      : 'intercepted',
    simulatedResponse: simResponse ?? undefined,
    telegramNotified: false,
  };

  // Persist event log (fire-and-forget; don't let a Firestore error block the caller)
  persistEvent(event).catch((err) =>
    console.error('[SmsManager] Failed to persist event:', err)
  );

  // Async Telegram notification
  if (config.telegramEnabled && config.notifyOnCapture) {
    sendTelegramNotification(event, config.telegramChatId)
      .then((result) => {
        if (!result.success) {
          console.warn('[SmsManager] Telegram notification failed:', result.error);
        }
        // Update telegramNotified flag in background
        updateEventTelegramStatus(eventId, result.success, result.error).catch(() => undefined);
      })
      .catch((err) => console.error('[SmsManager] Telegram send error:', err));
  }

  return {
    event,
    simulatedResponse: simResponse,
    blocked: config.enabled && config.blockActualSend,
  };
}

// ─── Event Persistence ─────────────────────────────────────────────────────

async function persistEvent(event: SmsEvent): Promise<void> {
  const db = getFirestore();
  await db.collection(SMS_EVENTS_COLLECTION).doc(event.id).set(event);
}

async function updateEventTelegramStatus(
  eventId: string,
  success: boolean,
  error?: string
): Promise<void> {
  const db = getFirestore();
  const update: Partial<SmsEvent> = { telegramNotified: success };
  if (error) update.telegramError = error;
  await db.collection(SMS_EVENTS_COLLECTION).doc(eventId).update(update);
}

// ─── Event Log Queries ─────────────────────────────────────────────────────

export interface EventQueryOptions {
  limit?: number;
  campaignId?: string;
  deviceId?: string;
  status?: SmsEvent['status'];
  after?: string; // ISO timestamp
}

export async function querySmsEvents(opts: EventQueryOptions = {}): Promise<SmsEvent[]> {
  const db = getFirestore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = db.collection(SMS_EVENTS_COLLECTION).orderBy('timestamp', 'desc');

  if (opts.campaignId) q = q.where('campaignId', '==', opts.campaignId);
  if (opts.deviceId) q = q.where('deviceId', '==', opts.deviceId);
  if (opts.status) q = q.where('status', '==', opts.status);
  if (opts.after) q = q.where('timestamp', '>', opts.after);

  q = q.limit(opts.limit ?? 100);

  const snap = await q.get();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return snap.docs.map((d: any) => ({ id: d.id, ...d.data() }) as SmsEvent);
}

export async function getSmsEvent(eventId: string): Promise<SmsEvent | null> {
  const db = getFirestore();
  const snap = await db.collection(SMS_EVENTS_COLLECTION).doc(eventId).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as SmsEvent;
}
