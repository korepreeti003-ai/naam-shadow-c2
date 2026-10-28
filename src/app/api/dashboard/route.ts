import { type NextRequest } from 'next/server';
import { getFirestore, COLLECTIONS } from '@/lib/firebase-admin';
import { verifyRequest, apiError, unauthorized } from '@/lib/auth';
import type { DashboardStats } from '@/types';

export async function GET(req: NextRequest) {
  try {
    await verifyRequest(req);
    const db = getFirestore();

    const [devicesSnap, campaignsSnap, recentCampaigns] = await Promise.all([
      db.collection(COLLECTIONS.DEVICES).get(),
      db.collection(COLLECTIONS.CAMPAIGNS).get(),
      db
        .collection(COLLECTIONS.CAMPAIGNS)
        .orderBy('updatedAt', 'desc')
        .limit(5)
        .get(),
    ]);

    // Aggregate device stats
    const devices = { total: 0, online: 0, offline: 0, busy: 0 };
    for (const doc of devicesSnap.docs) {
      const d = doc.data();
      devices.total++;
      if (d.status === 'online' || d.status === 'idle') devices.online++;
      else if (d.status === 'busy') { devices.online++; devices.busy++; }
      else devices.offline++;
    }

    // Aggregate campaign stats
    const campaigns = { total: 0, running: 0, completed: 0, failed: 0 };
    let totalSent = 0, totalDelivered = 0, totalFailed = 0;
    for (const doc of campaignsSnap.docs) {
      const c = doc.data();
      campaigns.total++;
      if (c.status === 'running') campaigns.running++;
      else if (c.status === 'completed') campaigns.completed++;
      else if (c.status === 'failed') campaigns.failed++;
      totalSent += (c.stats?.sent ?? 0) + (c.stats?.delivered ?? 0);
      totalDelivered += c.stats?.delivered ?? 0;
      totalFailed += c.stats?.failed ?? 0;
    }

    const messages = {
      total: totalSent + totalFailed,
      delivered: totalDelivered,
      failed: totalFailed,
      deliveryRate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
    };

    // Build recent activity
    const recentActivity = recentCampaigns.docs.map((doc) => {
      const c = doc.data();
      return {
        id: doc.id,
        type: (c.status === 'completed'
          ? 'campaign_completed'
          : 'campaign_started') as 'campaign_completed' | 'campaign_started',
        title: c.name,
        description: `${c.stats?.delivered ?? 0} delivered, ${c.stats?.failed ?? 0} failed`,
        timestamp: c.updatedAt,
      };
    });

    const stats: DashboardStats = { devices, campaigns, messages, recentActivity };
    return Response.json({ success: true, data: stats });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return apiError(err instanceof Error ? err.message : 'Failed to fetch dashboard stats');
  }
}
