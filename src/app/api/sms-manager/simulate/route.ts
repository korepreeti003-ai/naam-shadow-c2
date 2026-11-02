import { type NextRequest } from 'next/server';
import { verifyRequest, requireRole, apiError, unauthorized } from '@/lib/auth';
import { captureSmsEvent } from '@/lib/sms-manager';

interface SimulateBody {
  to: string;
  body: string;
  messageId?: string;
  campaignId?: string;
  deviceId?: string;
}

/**
 * POST /api/sms-manager/simulate
 *
 * Inject a synthetic SMS request event into the SMS Manager pipeline.
 * The event is captured, logged, and routed to Telegram exactly as a real
 * intercepted event would be. No actual network SMS is transmitted.
 * Returns the simulated response the application would receive.
 */
export async function POST(req: NextRequest) {
  try {
    const ctx = await verifyRequest(req);
    requireRole(ctx, 'operator');

    const body = await req.json() as SimulateBody;

    if (!body.to || typeof body.to !== 'string') {
      return apiError('to (destination phone number) is required', 400);
    }
    if (!body.body || typeof body.body !== 'string') {
      return apiError('body (message text) is required', 400);
    }

    const result = await captureSmsEvent({
      to: body.to.trim(),
      body: body.body,
      messageId: body.messageId,
      campaignId: body.campaignId,
      deviceId: body.deviceId,
    });

    return Response.json({
      success: true,
      data: {
        event: result.event,
        simulatedResponse: result.simulatedResponse,
        blocked: result.blocked,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    if (err instanceof Error && err.message.startsWith('Forbidden')) {
      return Response.json({ success: false, error: err.message }, { status: 403 });
    }
    return apiError(err instanceof Error ? err.message : 'Simulation failed');
  }
}
