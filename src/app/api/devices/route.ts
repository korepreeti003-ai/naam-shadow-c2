import { type NextRequest } from 'next/server';
import { getFirestore, COLLECTIONS, serverTimestamp } from '@/lib/firebase-admin';
import { verifyRequest, apiError, unauthorized } from '@/lib/auth';
import type { Device } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const ctx = await verifyRequest(req);
    const db = getFirestore();

    const url = new URL(req.url);
    const projectId = url.searchParams.get('projectId');
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20', 10);

    let query: FirebaseFirestore.Query = db.collection(COLLECTIONS.DEVICES);
    if (projectId) query = query.where('projectId', '==', projectId);
    if (status) query = query.where('status', '==', status);
    query = query.orderBy('lastSeen', 'desc');

    const [snapshot, countSnap] = await Promise.all([
      query.offset((page - 1) * pageSize).limit(pageSize).get(),
      query.count().get(),
    ]);

    const devices = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Device[];
    const total = countSnap.data().count;

    return Response.json({
      success: true,
      data: { items: devices, total, page, pageSize, hasMore: page * pageSize < total },
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) {
      return unauthorized();
    }
    return apiError(err instanceof Error ? err.message : 'Failed to fetch devices');
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await verifyRequest(req);
    const db = getFirestore();
    const body = await req.json() as Partial<Device>;

    if (!body.fcmToken || !body.projectId || !body.name) {
      return apiError('fcmToken, projectId and name are required', 400);
    }

    // Check for existing device with this FCM token
    const existing = await db
      .collection(COLLECTIONS.DEVICES)
      .where('fcmToken', '==', body.fcmToken)
      .limit(1)
      .get();

    if (!existing.empty) {
      const existingDoc = existing.docs[0];
      await existingDoc.ref.update({
        name: body.name,
        projectId: body.projectId,
        model: body.model,
        androidVersion: body.androidVersion,
        appVersion: body.appVersion,
        capabilities: body.capabilities ?? ['sms'],
        status: 'idle',
        lastSeen: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return Response.json({
        success: true,
        data: { id: existingDoc.id },
        message: 'Device updated',
      });
    }

    const now = new Date().toISOString();
    const docRef = await db.collection(COLLECTIONS.DEVICES).add({
      name: body.name,
      projectId: body.projectId,
      fcmToken: body.fcmToken,
      phoneNumber: body.phoneNumber ?? null,
      model: body.model ?? null,
      androidVersion: body.androidVersion ?? null,
      appVersion: body.appVersion ?? null,
      capabilities: body.capabilities ?? ['sms'],
      status: 'offline',
      lastSeen: null,
      messagesSent: 0,
      messagesDelivered: 0,
      messagesFailed: 0,
      createdAt: now,
      updatedAt: now,
    });

    return Response.json({ success: true, data: { id: docRef.id } }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) {
      return unauthorized();
    }
    return apiError(err instanceof Error ? err.message : 'Failed to register device');
  }
}
