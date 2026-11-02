import { getMessaging, getMessagingForProject } from './firebase-admin';
import { captureSmsEvent, getSmsManagerConfig } from './sms-manager';
import type { FcmPayload, FcmSmsPayload } from '@/types';

async function getMessagingInstance(projectId?: string) {
  if (projectId) return getMessagingForProject(projectId);
  return getMessaging();
}

export async function sendFcmMessage(
  fcmToken: string,
  payload: FcmPayload,
  projectId?: string
): Promise<{ messageId: string; success: boolean; error?: string }> {
  try {
    const messaging = await getMessagingInstance(projectId);

    const messageId = await messaging.send({
      token: fcmToken,
      data: {
        payload: JSON.stringify(payload),
        type: payload.type,
      },
      android: {
        priority: 'high',
        ttl: 60000,
      },
    });

    return { messageId, success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { messageId: '', success: false, error };
  }
}

export async function pingDevice(
  fcmToken: string,
  projectId?: string
): Promise<{ success: boolean; error?: string }> {
  const result = await sendFcmMessage(fcmToken, { type: 'PING', timestamp: Date.now() }, projectId);
  return { success: result.success, error: result.error };
}

export async function dispatchSms(
  fcmToken: string,
  messageId: string,
  campaignId: string,
  to: string,
  text: string,
  projectId?: string,
  deviceId?: string
): Promise<{ messageId: string; success: boolean; error?: string }> {
  // Check if SMS Manager simulation mode is active before sending via FCM
  const config = await getSmsManagerConfig();

  if (config.enabled) {
    const result = await captureSmsEvent({ to, body: text, messageId, campaignId, deviceId });

    // Capture the event regardless; if blocking is on, return the simulated response
    if (result.blocked && result.simulatedResponse) {
      const sim = result.simulatedResponse;
      if (sim.deliveryDelayMs && sim.deliveryDelayMs > 0) {
        await new Promise((r) => setTimeout(r, sim.deliveryDelayMs));
      }
      return {
        messageId: sim.messageId,
        success: sim.success,
        error: sim.success ? undefined : (sim.errorMessage ?? 'Simulated failure'),
      };
    }

    // Simulation enabled but blockActualSend is off — still capture, then fall through
  } else {
    // Passive intercept: log without blocking
    captureSmsEvent({ to, body: text, messageId, campaignId, deviceId }).catch(() => undefined);
  }

  // Real FCM dispatch
  return sendFcmMessage(
    fcmToken,
    { type: 'SEND_SMS', messageId, campaignId, to, text, timestamp: Date.now() } as FcmSmsPayload,
    projectId
  );
}
