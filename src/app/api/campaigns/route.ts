import { type NextRequest } from 'next/server';
import { getFirestore, COLLECTIONS } from '@/lib/firebase-admin';
import { verifyRequest, requireRole, apiError, unauthorized, forbidden } from '@/lib/auth';
import { getCampaignQueue } from '@/lib/queue';
import type { Campaign, CampaignSettings } from '@/types';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_SETTINGS: CampaignSettings = {
  rateLimit: 10,
  retryCount: 3,
  retryDelayMs: 30000,
  respectDnd: true,
  dndStartHour: 21,
  dndEndHour: 9,
  timezone: 'Asia/Kolkata',
};

export async function GET(req: NextRequest) {
  try {
    await verifyRequest(req);
    const db = getFirestore();

    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const page = parseInt(url.searchParams.get('page') || '1', 10);
    const pageSize = parseInt(url.searchParams.get('pageSize') || '10', 10);

    let query: FirebaseFirestore.Query = db.collection(COLLECTIONS.CAMPAIGNS);
    if (status) query = query.where('status', '==', status);
    query = query.orderBy('createdAt', 'desc');

    const [snapshot, countSnap] = await Promise.all([
      query.offset((page - 1) * pageSize).limit(pageSize).get(),
      query.count().get(),
    ]);

    const campaigns = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Campaign[];
    const total = countSnap.data().count;

    return Response.json({
      success: true,
      data: { items: campaigns, total, page, pageSize, hasMore: page * pageSize < total },
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return apiError(err instanceof Error ? err.message : 'Failed to fetch campaigns');
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await verifyRequest(req);
    requireRole(ctx, 'operator');

    const db = getFirestore();
    const body = await req.json() as {
      name: string;
      message: string;
      projectId: string;
      deviceIds: string[];
      batchId: string;
      scheduledAt?: string;
      settings?: Partial<CampaignSettings>;
    };

    if (!body.name || !body.message || !body.projectId || !body.deviceIds?.length || !body.batchId) {
      return apiError('name, message, projectId, deviceIds and batchId are required', 400);
    }

    // Verify batch exists and get contact count
    const batchDoc = await db.collection(COLLECTIONS.CONTACT_BATCHES).doc(body.batchId).get();
    if (!batchDoc.exists) {
      return apiError('Contact batch not found', 404);
    }

    const batchData = batchDoc.data()!;
    const totalContacts = batchData.validCount as number;

    const now = new Date().toISOString();
    const campaign: Omit<Campaign, 'id'> = {
      name: body.name,
      message: body.message,
      status: 'draft',
      projectId: body.projectId,
      deviceIds: body.deviceIds,
      batchId: body.batchId,
      scheduledAt: body.scheduledAt,
      createdAt: now,
      updatedAt: now,
      createdBy: ctx.uid,
      stats: {
        total: totalContacts,
        queued: 0,
        sending: 0,
        sent: 0,
        delivered: 0,
        failed: 0,
        optedOut: 0,
        invalid: 0,
      },
      settings: { ...DEFAULT_SETTINGS, ...body.settings },
    };

    const docRef = await db.collection(COLLECTIONS.CAMPAIGNS).add(campaign);

    return Response.json({ success: true, data: { id: docRef.id } }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    if (err instanceof Error && err.message.startsWith('Forbidden')) return forbidden();
    return apiError(err instanceof Error ? err.message : 'Failed to create campaign');
  }
}
