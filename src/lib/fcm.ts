import { getMessaging } from './firebase-admin';
import type { FcmPayload } from '@/types';

export async function sendFcmMessage(
  fcmToken: string,
  payload: FcmPayload
): Promise<{ messageId: string; success: boolean; error?: string }> {
  try {
    const messaging = getMessaging();

    const messageId = await messaging.send({
      token: fcmToken,
      data: {
        payload: JSON.stringify(payload),
        type: payload.type,
      },
      android: {
        priority: 'high',
        ttl: 60000, // 1 minute TTL for SMS dispatch
      },
    });

    return { messageId, success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { messageId: '', success: false, error };
  }
}

export async function pingDevice(
  fcmToken: string
): Promise<{ success: boolean; error?: string }> {
  const result = await sendFcmMessage(fcmToken, {
    type: 'PING',
    timestamp: Date.now(),
  });
  return { success: result.success, error: result.error };
}

export async function dispatchSms(
  fcmToken: string,
  messageId: string,
  campaignId: string,
  to: string,
  text: string
): Promise<{ messageId: string; success: boolean; error?: string }> {
  return sendFcmMessage(fcmToken, {
    type: 'SEND_SMS',
    messageId,
    campaignId,
    to,
    text,
    timestamp: Date.now(),
  });
}
