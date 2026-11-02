import { type NextRequest } from 'next/server';
import { verifyRequest, apiError, unauthorized } from '@/lib/auth';
import { querySmsEvents, getSmsEvent, type EventQueryOptions } from '@/lib/sms-manager';
import type { SmsEvent } from '@/types';

// GET /api/sms-manager/events?limit=50&campaignId=...&status=...&after=...&id=...
export async function GET(req: NextRequest) {
  try {
    await verifyRequest(req);

    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('id');

    if (eventId) {
      const event = await getSmsEvent(eventId);
      if (!event) return apiError('Event not found', 404);
      return Response.json({ success: true, data: event });
    }

    const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 500);
    const campaignId = searchParams.get('campaignId') ?? undefined;
    const deviceId = searchParams.get('deviceId') ?? undefined;
    const rawStatus = searchParams.get('status');
    const status = rawStatus as SmsEvent['status'] | undefined;
    const after = searchParams.get('after') ?? undefined;

    const opts: EventQueryOptions = { limit, campaignId, deviceId, after };
    if (status) opts.status = status;

    const events = await querySmsEvents(opts);
    return Response.json({ success: true, data: events, total: events.length });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return apiError(err instanceof Error ? err.message : 'Failed to query SMS events');
  }
}
