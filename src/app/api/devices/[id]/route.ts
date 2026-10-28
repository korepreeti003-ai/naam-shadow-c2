import { type NextRequest } from 'next/server';
import { getFirestore, COLLECTIONS } from '@/lib/firebase-admin';
import { verifyRequest, requireRole, apiError, unauthorized, forbidden } from '@/lib/auth';
import { pingDevice } from '@/lib/fcm';
import type { Device } from '@/types';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await verifyRequest(req);
    const db = getFirestore();
    const doc = await db.collection(COLLECTIONS.DEVICES).doc(params.id).get();
    if (!doc.exists) return apiError('Device not found', 404);
    return Response.json({ success: true, data: { id: doc.id, ...doc.data() } });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return apiError(err instanceof Error ? err.message : 'Failed to fetch device');
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await verifyRequest(req);
    requireRole(ctx, 'operator');

    const db = getFirestore();
    const doc = await db.collection(COLLECTIONS.DEVICES).doc(params.id).get();
    if (!doc.exists) return apiError('Device not found', 404);

    const body = await req.json() as Partial<Device>;
    const allowed: Partial<Device> = {};

    if (body.name !== undefined) allowed.name = body.name;
    if (body.fcmToken !== undefined) allowed.fcmToken = body.fcmToken;
    if (body.phoneNumber !== undefined) allowed.phoneNumber = body.phoneNumber;
    if (body.capabilities !== undefined) allowed.capabilities = body.capabilities;

    await doc.ref.update({ ...allowed, updatedAt: new Date().toISOString() });
    return Response.json({ success: true, message: 'Device updated' });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    if (err instanceof Error && err.message.startsWith('Forbidden')) return forbidden();
    return apiError(err instanceof Error ? err.message : 'Failed to update device');
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await verifyRequest(req);
    requireRole(ctx, 'admin');

    const db = getFirestore();
    await db.collection(COLLECTIONS.DEVICES).doc(params.id).delete();
    return Response.json({ success: true, message: 'Device removed' });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    if (err instanceof Error && err.message.startsWith('Forbidden')) return forbidden();
    return apiError(err instanceof Error ? err.message : 'Failed to remove device');
  }
}
