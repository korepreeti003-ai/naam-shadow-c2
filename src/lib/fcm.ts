import { getMessaging, getMessagingForProject } from './firebase-admin';
import type { FcmPayload } from '@/types';

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
  projectId?: string
): Promise<{ messageId: string; success: boolean; error?: string }> {
  return sendFcmMessage(
    fcmToken,
    { type: 'SEND_SMS', messageId, campaignId, to, text, timestamp: Date.now() },
    projectId
  );
}
