import { type NextRequest } from 'next/server';
import { getFirestore, COLLECTIONS } from '@/lib/firebase-admin';
import { verifyRequest, requireRole, apiError, unauthorized, forbidden } from '@/lib/auth';
import { pingDevice } from '@/lib/fcm';
import type { Device } from '@/types';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await verifyRequest(req);
    requireRole(ctx, 'operator');

    const db = getFirestore();
    const doc = await db.collection(COLLECTIONS.DEVICES).doc(params.id).get();
    if (!doc.exists) return apiError('Device not found', 404);

    const device = { id: doc.id, ...doc.data() } as Device;
    const result = await pingDevice(device.fcmToken);

    if (result.success) {
      await doc.ref.update({ lastSeen: new Date().toISOString() });
    }

    return Response.json({
      success: result.success,
      message: result.success ? 'Ping sent' : `Ping failed: ${result.error}`,
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    if (err instanceof Error && err.message.startsWith('Forbidden')) return forbidden();
    return apiError(err instanceof Error ? err.message : 'Ping failed');
  }
}
