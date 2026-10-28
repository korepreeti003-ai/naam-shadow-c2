import { type NextRequest } from 'next/server';
import { getFirestore, COLLECTIONS } from '@/lib/firebase-admin';
import { verifyRequest, apiError, unauthorized } from '@/lib/auth';
import type { AppUser } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const ctx = await verifyRequest(req);
    const db = getFirestore();

    const doc = await db.collection(COLLECTIONS.USERS).doc(ctx.uid).get();
    const user: AppUser = doc.exists
      ? (doc.data() as AppUser)
      : {
          uid: ctx.uid,
          email: ctx.email,
          role: ctx.role,
          createdAt: new Date().toISOString(),
        };

    return Response.json({ success: true, data: user });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Unauthorized')) return unauthorized();
    return apiError(err instanceof Error ? err.message : 'Failed to fetch user');
  }
}
