import { type NextRequest } from 'next/server';
import { getFirestore, COLLECTIONS } from '@/lib/firebase-admin';
import { verifyRequest, requireRole, apiError, unauthorized, forbidden } from '@/lib/auth';
import { normalizePhone } from '@/lib/csv';

export async function GET(req: NextRequest) {
  try {
    await verifyRequest(req);
    const db = getFirestore();
    const snapshot = await db.collection(COLLECTIONS.OPTED_OUT).get();
    const phones = snapshot.docs.map((d) => d.id);
    return Response.json({ success: true, data: phones });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return apiError(err instanceof Error ? err.message : 'Failed to fetch opted-out list');
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await verifyRequest(req);
    requireRole(ctx, 'operator');

    const db = getFirestore();
    const { phone } = (await req.json()) as { phone: string };

    if (!phone) return apiError('phone is required', 400);

    const normalized = normalizePhone(phone);
    if (!normalized) return apiError(`Invalid phone number: "${phone}"`, 400);

    await db.collection(COLLECTIONS.OPTED_OUT).doc(normalized).set({
      addedAt: new Date().toISOString(),
      addedBy: ctx.uid,
    });

    return Response.json({ success: true, data: { phone: normalized } });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    if (err instanceof Error && err.message.startsWith('Forbidden')) return forbidden();
    return apiError(err instanceof Error ? err.message : 'Failed to add opt-out');
  }
}
