import { type NextRequest } from 'next/server';
import { getFirestore, COLLECTIONS } from '@/lib/firebase-admin';
import { apiError } from '@/lib/auth';

// Called by Android devices to report status updates and delivery receipts

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      deviceId: string;
      apiKey?: string;
      type: 'STATUS_UPDATE' | 'DELIVERY_RECEIPT' | 'HEARTBEAT';
      // STATUS_UPDATE fields
      status?: string;
      batteryLevel?: number;
      signalStrength?: number;
      // DELIVERY_RECEIPT fields
      messageId?: string;
      campaignId?: string;
      delivered?: boolean;
      failureReason?: string;
    };

    if (!body.deviceId) {
      return apiError('deviceId is required', 400);
    }

    const db = getFirestore();
    const deviceRef = db.collection(COLLECTIONS.DEVICES).doc(body.deviceId);
    const deviceDoc = await deviceRef.get();

    if (!deviceDoc.exists) {
      return apiError('Device not found', 404);
    }

    const now = new Date().toISOString();

    if (body.type === 'STATUS_UPDATE' || body.type === 'HEARTBEAT') {
      await deviceRef.update({
        status: body.status ?? 'online',
        batteryLevel: body.batteryLevel ?? null,
        signalStrength: body.signalStrength ?? null,
        lastSeen: now,
        updatedAt: now,
      });
    }

    if (body.type === 'DELIVERY_RECEIPT' && body.messageId) {
      const msgRef = db.collection(COLLECTIONS.MESSAGES).doc(body.messageId);
      const msgDoc = await msgRef.get();

      if (msgDoc.exists) {
        const newStatus = body.delivered ? 'delivered' : 'failed';
        const update: Record<string, unknown> = {
          status: newStatus,
          deviceAck: true,
          updatedAt: now,
        };

        if (body.delivered) {
          update.deliveredAt = now;
        } else {
          update.failureReason = body.failureReason ?? 'Unknown failure';
        }

        await msgRef.update(update);

        // Update campaign stats
        if (body.campaignId) {
          const campaignRef = db.collection(COLLECTIONS.CAMPAIGNS).doc(body.campaignId);
          const field = body.delivered ? 'stats.delivered' : 'stats.failed';
          await campaignRef.update({
            [field]: ((await campaignRef.get()).data()?.stats?.delivered ?? 0) + 1,
            updatedAt: now,
          });
        }

        // Update device counters
        const deviceUpdate: Record<string, unknown> = { lastSeen: now, updatedAt: now };
        if (body.delivered) {
          deviceUpdate['messagesDelivered'] = (deviceDoc.data()?.messagesDelivered ?? 0) + 1;
        } else {
          deviceUpdate['messagesFailed'] = (deviceDoc.data()?.messagesFailed ?? 0) + 1;
        }
        await deviceRef.update(deviceUpdate);
      }
    }

    return Response.json({ success: true });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Webhook processing failed');
  }
}
