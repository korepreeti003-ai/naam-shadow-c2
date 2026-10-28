import { type NextRequest } from 'next/server';
import { getFirestore, COLLECTIONS } from '@/lib/firebase-admin';
import { verifyRequest, apiError, unauthorized } from '@/lib/auth';
import type { Contact } from '@/types';

export async function GET(req: NextRequest) {
  try {
    await verifyRequest(req);
    const db = getFirestore();

    const url = new URL(req.url);
    const campaignId = url.searchParams.get('campaignId');
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') || '50', 10);

    if (!campaignId) return apiError('campaignId is required', 400);

    let query: FirebaseFirestore.Query = db
      .collection(COLLECTIONS.CONTACTS)
      .where('campaignId', '==', campaignId);

    if (status) query = query.where('status', '==', status);
    query = query.orderBy('createdAt', 'asc');

    const [snapshot, countSnap] = await Promise.all([
      query.offset((page - 1) * pageSize).limit(pageSize).get(),
      query.count().get(),
    ]);

    const contacts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Contact[];
    const total = countSnap.data().count;

    return Response.json({
      success: true,
      data: { items: contacts, total, page, pageSize, hasMore: page * pageSize < total },
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return apiError(err instanceof Error ? err.message : 'Failed to fetch contacts');
  }
}
