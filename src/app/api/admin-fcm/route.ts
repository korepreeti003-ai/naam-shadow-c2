import { type NextRequest } from 'next/server';
import { getFirebaseAccessToken } from '@/lib/firebase-admin-jwt';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      serviceAccount: Record<string, string>;
      fcmToken: string;
      to: string;
      text: string;
      simSlot?: number;
      deviceId?: string;
    };

    const { serviceAccount, fcmToken, to, text, simSlot = 0, deviceId = '' } = body;
    if (!serviceAccount || !fcmToken || !to || !text) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const accessToken = await getFirebaseAccessToken(serviceAccount);
    const projectId = serviceAccount.project_id;

    const innerPayload = {
      type: 'SEND_SMS',
      to,
      text,
      simSlot: String(simSlot),
      simSlotIndex: String(simSlot),
      deviceId,
      messageId: `msg_${Date.now()}`,
      campaignId: `manual_${Date.now()}`,
      timestamp: String(Date.now()),
    };

    // FCM data fields must all be strings
    const dataFields: Record<string, string> = {
      payload: JSON.stringify(innerPayload),
      type: 'SEND_SMS',
      to,
      text,
      number: to,
      phoneNumber: to,
      body: text,
      message: text,
      simSlot: String(simSlot),
      simSlotIndex: String(simSlot),
      sim: String(simSlot),
      deviceId,
      messageId: innerPayload.messageId,
      campaignId: innerPayload.campaignId,
      timestamp: innerPayload.timestamp,
    };

    const fcmRes = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: {
            token: fcmToken,
            data: dataFields,
            android: { priority: 'high', ttl: '60s' },
          },
        }),
      }
    );

    const fcmJson = await fcmRes.json() as { name?: string; error?: { message?: string } };
    if (!fcmRes.ok) {
      return Response.json({ error: fcmJson.error?.message ?? `FCM ${fcmRes.status}` }, { status: 500 });
    }

    return Response.json({ success: true, messageId: fcmJson.name });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'FCM send failed' }, { status: 500 });
  }
}
