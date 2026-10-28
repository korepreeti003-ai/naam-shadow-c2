import { type NextRequest } from 'next/server';
import { getFirestore, COLLECTIONS } from '@/lib/firebase-admin';
import { verifyRequest, requireRole, apiError, unauthorized, forbidden } from '@/lib/auth';
import { getCampaignQueue } from '@/lib/queue';
import type { Campaign, CampaignStatus } from '@/types';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await verifyRequest(req);
    const db = getFirestore();
    const doc = await db.collection(COLLECTIONS.CAMPAIGNS).doc(params.id).get();
    if (!doc.exists) return apiError('Campaign not found', 404);
    return Response.json({ success: true, data: { id: doc.id, ...doc.data() } });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return apiError(err instanceof Error ? err.message : 'Failed to fetch campaign');
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ctx = await verifyRequest(req);
    requireRole(ctx, 'operator');

    const db = getFirestore();
    const doc = await db.collection(COLLECTIONS.CAMPAIGNS).doc(params.id).get();
    if (!doc.exists) return apiError('Campaign not found', 404);

    const campaign = { id: doc.id, ...doc.data() } as Campaign;
    const body = await req.json() as { action?: 'start' | 'pause' | 'resume' | 'cancel'; name?: string; message?: string };

    if (body.action) {
      const validTransitions: Record<string, CampaignStatus[]> = {
        start: ['draft', 'scheduled'],
        pause: ['running'],
        resume: ['paused'],
        cancel: ['draft', 'scheduled', 'queued', 'running', 'paused'],
      };

      if (!validTransitions[body.action]?.includes(campaign.status)) {
        return apiError(
          `Cannot ${body.action} a campaign with status "${campaign.status}"`,
          400
        );
      }

      const queue = getCampaignQueue();
      await queue.add(`campaign-${body.action}`, {
        campaignId: params.id,
        action: body.action,
      });

      const newStatus: CampaignStatus =
        body.action === 'start'
          ? 'queued'
          : body.action === 'pause'
          ? 'paused'
          : body.action === 'resume'
          ? 'queued'
          : 'cancelled';

      await doc.ref.update({ status: newStatus, updatedAt: new Date().toISOString() });
      return Response.json({ success: true, message: `Campaign ${body.action} queued` });
    }

    // Edit draft campaign
    if (campaign.status !== 'draft') {
      return apiError('Can only edit campaigns in draft status', 400);
    }

    const updates: Partial<Campaign> = { updatedAt: new Date().toISOString() };
    if (body.name) updates.name = body.name;
    if (body.message) updates.message = body.message;

    await doc.ref.update(updates);
    return Response.json({ success: true, message: 'Campaign updated' });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    if (err instanceof Error && err.message.startsWith('Forbidden')) return forbidden();
    return apiError(err instanceof Error ? err.message : 'Failed to update campaign');
  }
}
