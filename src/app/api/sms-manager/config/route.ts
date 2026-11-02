import { type NextRequest } from 'next/server';
import { verifyRequest, requireRole, apiError, unauthorized } from '@/lib/auth';
import {
  getSmsManagerConfig,
  updateSmsManagerConfig,
  invalidateSmsManagerConfigCache,
} from '@/lib/sms-manager';
import type { SmsManagerConfig } from '@/types';

// GET /api/sms-manager/config
export async function GET(req: NextRequest) {
  try {
    await verifyRequest(req);
    const config = await getSmsManagerConfig();
    return Response.json({ success: true, data: config });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return apiError(err instanceof Error ? err.message : 'Failed to read SMS manager config');
  }
}

// PATCH /api/sms-manager/config  (operator or admin only)
export async function PATCH(req: NextRequest) {
  try {
    const ctx = await verifyRequest(req);
    requireRole(ctx, 'operator');

    const body = await req.json() as Partial<SmsManagerConfig>;

    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') {
      return apiError('enabled must be a boolean', 400);
    }
    if (body.blockActualSend !== undefined && typeof body.blockActualSend !== 'boolean') {
      return apiError('blockActualSend must be a boolean', 400);
    }
    if (body.telegramEnabled !== undefined && typeof body.telegramEnabled !== 'boolean') {
      return apiError('telegramEnabled must be a boolean', 400);
    }

    const updated = await updateSmsManagerConfig(body);
    invalidateSmsManagerConfigCache();
    return Response.json({ success: true, data: updated });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    if (err instanceof Error && err.message.startsWith('Forbidden')) {
      return Response.json({ success: false, error: err.message }, { status: 403 });
    }
    return apiError(err instanceof Error ? err.message : 'Failed to update SMS manager config');
  }
}
