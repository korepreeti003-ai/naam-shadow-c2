import { type NextRequest } from 'next/server';
import { getFirestore, COLLECTIONS } from '@/lib/firebase-admin';
import { verifyRequest, apiError, unauthorized } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    await verifyRequest(req);
    const db = getFirestore();

    const snapshot = await db
      .collection(COLLECTIONS.CONTACT_BATCHES)
      .orderBy('uploadedAt', 'desc')
      .limit(50)
      .get();

    const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    return Response.json({ success: true, data: { items } });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return apiError(err instanceof Error ? err.message : 'Failed to fetch batches');
  }
}
