import { type NextRequest } from 'next/server';
import { getAuth, getFirestore, COLLECTIONS } from './firebase-admin';
import type { AppUser, UserRole } from '@/types';

export interface AuthContext {
  uid: string;
  email: string;
  role: UserRole;
}

export async function verifyRequest(req: NextRequest): Promise<AuthContext> {
  const token =
    req.headers.get('authorization')?.replace('Bearer ', '') ||
    req.cookies.get('session')?.value;

  if (!token) {
    throw new Error('Unauthorized: no token provided');
  }

  const decoded = await getAuth().verifyIdToken(token);
  const uid = decoded.uid;
  const email = decoded.email ?? '';

  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim());

  const db = getFirestore();
  const userDoc = await db.collection(COLLECTIONS.USERS).doc(uid).get();

  let role: UserRole = 'viewer';

  if (userDoc.exists) {
    role = (userDoc.data() as AppUser).role ?? 'viewer';
  } else if (adminEmails.includes(email)) {
    role = 'admin';
    await db.collection(COLLECTIONS.USERS).doc(uid).set({
      uid,
      email,
      role: 'admin',
      createdAt: new Date().toISOString(),
    });
  }

  return { uid, email, role };
}

export function requireRole(ctx: AuthContext, minRole: UserRole): void {
  const hierarchy: UserRole[] = ['viewer', 'operator', 'admin'];
  if (hierarchy.indexOf(ctx.role) < hierarchy.indexOf(minRole)) {
    throw new Error(`Forbidden: requires ${minRole} role`);
  }
}

export function unauthorized(message = 'Unauthorized') {
  return Response.json({ success: false, error: message }, { status: 401 });
}

export function forbidden(message = 'Forbidden') {
  return Response.json({ success: false, error: message }, { status: 403 });
}

export function apiError(message: string, status = 500) {
  return Response.json({ success: false, error: message }, { status });
}
